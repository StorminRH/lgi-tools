// Production scanner-paste boundary. Public handlers are gate-first; one
// applyScan transaction owns tracked-system verification, monotonic payload
// merge, sig-to-connection migration, missing classification, and removals.
import {
  paginationOptsValidator,
  type PaginationOptions,
  type PaginationResult,
} from 'convex/server';
import { ConvexError, v } from 'convex/values';
import {
  chainTombstoneStamps,
  isTombstoned,
} from '@/data/maps/chain-contract';
import {
  findMissingSignatures,
  isConfidentMissingRemoval,
} from '@/data/maps/signature-lifecycle';
import {
  isScannerSignatureId,
  SIG_GROUPS,
  type ScannedRow,
} from '@/data/maps/scan-parse';
import type { Doc } from './_generated/dataModel';
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { requireMapAccess, tryMapAccess } from './lib/mapAccess';
import {
  findConnectionForSignature,
  readOriginConnections,
} from './lib/mapConnectionLookup';
import {
  mergeSignatureKnowledge,
  normalizeSignatureKnowledge,
  scannedKindValidator,
  validateSignatureKnowledge,
} from './lib/mapEntityContracts';
import {
  applyKnownSignatureTombstone,
  touchKnownSignatureActivity,
} from './lib/mapSignatures';
import {
  purgeExpiredSignatures,
  SIGNATURE_PURGE_BATCH,
} from './lib/mapSignatureCleanup';
import { findSystem, requireSystemId } from './lib/mapSystemLookup';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTracking';

/** Maximum rows accepted or read for one system-level scanner transaction. */
export const MAP_SCAN_ROW_LIMIT = 256;

/** Maximum rows returned by one live signature page. */
export const MAP_SIGNATURE_PAGE_SIZE = 100;

const sigGroupValidator = v.union(
  v.literal(SIG_GROUPS[0]),
  v.literal(SIG_GROUPS[1]),
  v.literal(SIG_GROUPS[2]),
  v.literal(SIG_GROUPS[3]),
  v.literal(SIG_GROUPS[4]),
  v.literal(SIG_GROUPS[5]),
);

const scanRowValidator = v.object({
  signatureId: v.string(),
  kind: scannedKindValidator,
  group: v.union(sigGroupValidator, v.null()),
  name: v.union(v.string(), v.null()),
  signalPct: v.union(v.number(), v.null()),
});

interface ScanState {
  readonly signatures: Doc<'mapSignatures'>[];
  readonly connections: Doc<'mapConnections'>[];
  readonly activities: Doc<'mapSignatureActivity'>[];
}

type ApplyOutcome = 'inserted' | 'updated' | 'unchanged' | 'migrated';

/** A complete empty page for a caller without current map access. */
function deniedPage<Row>(): PaginationResult<Row> {
  return { page: [], isDone: true, continueCursor: '' };
}

function boundedPageOptions(options: PaginationOptions): PaginationOptions {
  return {
    ...options,
    numItems: Math.max(1, Math.min(options.numItems, MAP_SIGNATURE_PAGE_SIZE)),
  };
}

function requireBoundedRows(rows: readonly ScannedRow[]): ScannedRow[] {
  if (rows.length === 0 || rows.length > MAP_SCAN_ROW_LIMIT) {
    throw new ConvexError({
      code: 'INVALID_SCAN_SIZE',
      detail: `A scan must contain between 1 and ${MAP_SCAN_ROW_LIMIT} rows.`,
    });
  }
  const normalized = rows.map((row) => ({ ...row, signatureId: row.signatureId.trim() }));
  const ids = new Set<string>();
  for (const row of normalized) {
    if (!isScannerSignatureId(row.signatureId)) {
      throw new ConvexError({
        code: 'INVALID_SIGNATURE_ID',
        detail: `Invalid scanner signature ID "${row.signatureId}".`,
      });
    }
    if (ids.has(row.signatureId)) {
      throw new ConvexError({
        code: 'DUPLICATE_SIGNATURE_ID',
        detail: `Signature ${row.signatureId} appears more than once in one paste.`,
      });
    }
    ids.add(row.signatureId);
  }
  return normalized;
}

function requireBoundedSignatureIds(signatureIds: readonly string[]): string[] {
  if (signatureIds.length === 0 || signatureIds.length > MAP_SCAN_ROW_LIMIT) {
    throw new ConvexError({
      code: 'INVALID_SIGNATURE_SELECTION',
      detail: `Select between 1 and ${MAP_SCAN_ROW_LIMIT} signatures.`,
    });
  }
  const normalized = [...new Set(signatureIds.map((id) => id.trim()))];
  if (normalized.some((id) => !isScannerSignatureId(id))) {
    throw new ConvexError({ code: 'INVALID_SIGNATURE_ID' });
  }
  return normalized;
}

async function requireTrackedSystem(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  userId: string,
): Promise<void> {
  requireSystemId(systemId);
  const tracking = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
    .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP + 1);
  if (tracking.length > TRACKED_CHARACTERS_PER_MAP_USER_CAP) {
    throw new ConvexError({ code: 'TRACKING_CAP_EXCEEDED' });
  }

  let trackedHere = false;
  for (const row of tracking) {
    const location = await ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', userId).eq('characterId', row.characterId),
      )
      .unique();
    if (location?.solarSystemId === systemId) trackedHere = true;
  }
  if (!trackedHere) {
    throw new ConvexError({
      code: 'UNTRACKED_SCAN_SYSTEM',
      detail: `The caller has no tracked character in system ${systemId}.`,
    });
  }
  const system = await findSystem(ctx, mapId, systemId);
  if (system === null || isTombstoned(system)) {
    throw new ConvexError({
      code: 'OFF_MAP_SCAN_SYSTEM',
      detail: `Tracked system ${systemId} is not live on map ${mapId}.`,
    });
  }
}

async function requireLiveSystem(ctx: MutationCtx, mapId: string, systemId: number): Promise<void> {
  requireSystemId(systemId);
  const system = await findSystem(ctx, mapId, systemId);
  if (system === null || isTombstoned(system)) {
    throw new ConvexError({ code: 'UNKNOWN_SYSTEM' });
  }
}

async function readSystemSignatures(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
): Promise<Doc<'mapSignatures'>[]> {
  const rows = await ctx.db
    .query('mapSignatures')
    .withIndex('by_map_signature', (q) => q.eq('mapId', mapId).eq('systemId', systemId))
    .take(MAP_SCAN_ROW_LIMIT + 1);
  if (rows.length > MAP_SCAN_ROW_LIMIT) {
    throw new ConvexError({
      code: 'MAP_SIGNATURE_SCAN_LIMIT',
      detail: `System ${systemId} exceeds the ${MAP_SCAN_ROW_LIMIT}-signature scan bound.`,
    });
  }
  return rows;
}

async function readSystemActivities(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
): Promise<Doc<'mapSignatureActivity'>[]> {
  const rows = await ctx.db
    .query('mapSignatureActivity')
    .withIndex('by_map_signature', (q) => q.eq('mapId', mapId).eq('systemId', systemId))
    .take(MAP_SCAN_ROW_LIMIT + 1);
  if (rows.length > MAP_SCAN_ROW_LIMIT) {
    throw new ConvexError({
      code: 'MAP_SIGNATURE_SCAN_LIMIT',
      detail: `System ${systemId} exceeds the ${MAP_SCAN_ROW_LIMIT}-activity scan bound.`,
    });
  }
  return rows;
}

async function readScanState(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
): Promise<ScanState> {
  const [signatures, connections, activities] = await Promise.all([
    readSystemSignatures(ctx, mapId, systemId),
    readOriginConnections(ctx, mapId, systemId),
    readSystemActivities(ctx, mapId, systemId),
  ]);
  return { signatures, connections, activities };
}

function rowMaps<Row extends { signatureId: string }>(rows: readonly Row[]): Map<string, Row> {
  return new Map(rows.map((row) => [row.signatureId, row]));
}

function connectionMap(rows: readonly Doc<'mapConnections'>[]): Map<string, Doc<'mapConnections'>> {
  return new Map(
    rows.flatMap((row) => row.fromSignatureId === undefined ? [] : [[row.fromSignatureId, row]]),
  );
}

function activityKey(mapId: string, systemId: number, signatureId: string) {
  return { mapId, systemId, signatureId };
}

async function touchScanActivity(
  ctx: MutationCtx,
  state: ScanState,
  mapId: string,
  systemId: number,
  signatureId: string,
  now: number,
): Promise<void> {
  const activity = state.activities.find((row) => row.signatureId === signatureId) ?? null;
  await touchKnownSignatureActivity(
    ctx,
    activityKey(mapId, systemId, signatureId),
    activity,
    now,
  );
}

function scanKnowledge(row: ScannedRow) {
  const knowledge = normalizeSignatureKnowledge({
    kind: row.kind,
    group: row.group,
    typeName: row.name,
    wormholeTypeCode: null,
    signalPct: row.signalPct,
  });
  validateSignatureKnowledge(knowledge);
  return knowledge;
}

async function applyListRow(
  ctx: MutationCtx,
  state: ScanState,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
): Promise<ApplyOutcome> {
  const signatures = rowMaps(state.signatures);
  const connections = connectionMap(state.connections);
  if (connections.has(row.signatureId)) {
    await touchScanActivity(ctx, state, mapId, systemId, row.signatureId, now);
    return 'unchanged';
  }

  const key = activityKey(mapId, systemId, row.signatureId);
  const existing = signatures.get(row.signatureId);
  if (existing !== undefined && isTombstoned(existing)) return 'unchanged';
  const knowledge = scanKnowledge(row);
  let outcome: ApplyOutcome = 'inserted';
  if (existing === undefined) {
    await ctx.db.insert('mapSignatures', {
      ...key,
      ...knowledge,
      deletedAt: null,
      purgeAfter: null,
    });
  } else {
    const merged = mergeSignatureKnowledge(existing, knowledge);
    if (merged.outcome === 'enriched') {
      await ctx.db.patch(existing._id, merged.patch);
      outcome = 'updated';
    } else {
      outcome = 'unchanged';
    }
  }
  await touchScanActivity(ctx, state, mapId, systemId, row.signatureId, now);
  return outcome;
}

function connectionSignalPatch(
  connection: Doc<'mapConnections'>,
  signalPct: number | null,
): Partial<Doc<'mapConnections'>> {
  const merged = mergeSignatureKnowledge(
    normalizeSignatureKnowledge({
      kind: 'signature',
      group: 'Wormhole',
      typeName: null,
      wormholeTypeCode: connection.wormholeTypeCode,
      signalPct: connection.fromSignalPct,
    }),
    normalizeSignatureKnowledge({
      kind: 'signature',
      group: 'Wormhole',
      typeName: null,
      wormholeTypeCode: null,
      signalPct,
    }),
  );
  return merged.outcome === 'enriched' && merged.patch.signalPct !== undefined
    ? { fromSignalPct: merged.patch.signalPct }
    : {};
}

async function insertWormholeConnection(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  row: ScannedRow,
  firstSeenAt: number,
  wormholeTypeCode: string | null,
): Promise<void> {
  await ctx.db.insert('mapConnections', {
    mapId,
    fromSystemId: systemId,
    toSystemId: null,
    fromSignatureId: row.signatureId,
    fromSignalPct: row.signalPct,
    firstSeenAt,
    wormholeTypeCode,
    massState: null,
    shipSize: null,
    eolAt: null,
    typedSide: wormholeTypeCode === null ? undefined : 'from',
    typeProvenance: wormholeTypeCode === null ? undefined : 'human',
    deletedAt: null,
    purgeAfter: null,
  });
}

type WormholeMigrationFacts =
  | { readonly outcome: 'conflict' }
  | {
      readonly outcome: 'ready';
      readonly signalPct: number | null;
      readonly wormholeTypeCode: string | null;
      readonly firstSeenAt: number;
      readonly migrated: boolean;
    };

function wormholeMigrationFacts(
  signature: Doc<'mapSignatures'> | undefined,
  row: ScannedRow,
  now: number,
): WormholeMigrationFacts {
  const incoming = scanKnowledge(row);
  if (signature === undefined) {
    return {
      outcome: 'ready',
      signalPct: row.signalPct,
      wormholeTypeCode: null,
      firstSeenAt: now,
      migrated: false,
    };
  }
  const merged = mergeSignatureKnowledge(signature, incoming);
  if (merged.outcome === 'conflict') return { outcome: 'conflict' };
  return {
    outcome: 'ready',
    signalPct: merged.outcome === 'enriched' && merged.patch.signalPct !== undefined
      ? merged.patch.signalPct
      : (signature.signalPct ?? null),
    wormholeTypeCode: signature.wormholeTypeCode,
    firstSeenAt: signature._creationTime,
    migrated: true,
  };
}

async function writeWormholeConnection(
  ctx: MutationCtx,
  connection: Doc<'mapConnections'> | undefined,
  facts: Extract<WormholeMigrationFacts, { outcome: 'ready' }>,
  row: ScannedRow,
  mapId: string,
  systemId: number,
): Promise<ApplyOutcome> {
  if (connection === undefined) {
    await insertWormholeConnection(
      ctx,
      mapId,
      systemId,
      { ...row, signalPct: facts.signalPct },
      facts.firstSeenAt,
      facts.wormholeTypeCode,
    );
    return facts.migrated ? 'migrated' : 'inserted';
  }
  const patch = {
    ...connectionSignalPatch(connection, facts.signalPct),
    ...(connection.firstSeenAt === undefined ? { firstSeenAt: connection._creationTime } : {}),
  };
  if (Object.keys(patch).length > 0) await ctx.db.patch(connection._id, patch);
  if (facts.migrated) return 'migrated';
  return Object.keys(patch).length > 0 ? 'updated' : 'unchanged';
}

async function applyWormholeRow(
  ctx: MutationCtx,
  state: ScanState,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
): Promise<ApplyOutcome> {
  const signature = rowMaps(state.signatures).get(row.signatureId);
  const connection = findConnectionForSignature(state.connections, row.signatureId);
  if (signature !== undefined && isTombstoned(signature)) return 'unchanged';
  if (connection !== undefined && isTombstoned(connection)) return 'unchanged';

  const facts = wormholeMigrationFacts(signature, row, now);
  if (facts.outcome === 'conflict') {
    await touchScanActivity(ctx, state, mapId, systemId, row.signatureId, now);
    return 'unchanged';
  }

  const outcome = await writeWormholeConnection(ctx, connection, facts, row, mapId, systemId);
  if (signature !== undefined) await ctx.db.delete(signature._id);
  await touchScanActivity(ctx, state, mapId, systemId, row.signatureId, now);
  return outcome;
}

function liveLifecycleRows(state: ScanState) {
  const signatures = state.signatures
    .filter((row) => !isTombstoned(row))
    .map((row) => ({ signatureId: row.signatureId, kind: row.kind }));
  const connections = state.connections
    .filter((row) => !isTombstoned(row) && row.fromSignatureId !== undefined)
    .flatMap((row) => row.fromSignatureId === undefined ? [] : [{
      signatureId: row.fromSignatureId,
      kind: 'signature' as const,
      deathLatestAt: row.deathLatestAt,
    }]);
  const byId = new Map([...signatures, ...connections].map((row) => [row.signatureId, row]));
  return [...byId.values()];
}

async function removeConfidentStubs(
  ctx: MutationCtx,
  state: ScanState,
  missingIds: readonly string[],
  now: number,
): Promise<Set<string>> {
  const removed = new Set<string>();
  const stamps = chainTombstoneStamps(now);
  for (const signatureId of missingIds) {
    const connection = findConnectionForSignature(state.connections, signatureId);
    if (
      connection === undefined
      || connection.toSystemId !== null
      || isTombstoned(connection)
      || !isConfidentMissingRemoval({
        signatureId,
        deathLatestAt: connection.deathLatestAt,
      }, now)
    ) continue;
    await ctx.db.patch(connection._id, stamps);
    const activity = state.activities.find((row) => row.signatureId === signatureId);
    if (activity !== undefined) await ctx.db.delete(activity._id);
    removed.add(signatureId);
  }
  return removed;
}

/** Applies one parsed scan only to the caller's live tracked map system. */
export const applyScan = mutation({
  args: { mapId: v.string(), systemId: v.number(), rows: v.array(scanRowValidator) },
  handler: async (ctx, { mapId, systemId, rows }) => {
    const principal = await requireMapAccess(ctx, mapId, 'edit');
    await requireTrackedSystem(ctx, mapId, systemId, principal.userId);
    const normalizedRows = requireBoundedRows(rows);
    const state = await readScanState(ctx, mapId, systemId);
    const missingRows = findMissingSignatures(liveLifecycleRows(state), normalizedRows);
    const now = Date.now();
    const counts = { inserted: 0, updated: 0, unchanged: 0, migrated: 0 };

    for (const row of normalizedRows) {
      const outcome = row.group === 'Wormhole'
        ? await applyWormholeRow(ctx, state, row, mapId, systemId, now)
        : await applyListRow(ctx, state, row, mapId, systemId, now);
      counts[outcome] += 1;
    }

    const confident = await removeConfidentStubs(
      ctx,
      state,
      missingRows.map((row) => row.signatureId),
      now,
    );
    return {
      ...counts,
      removedConfident: confident.size,
      missing: missingRows
        .map((row) => row.signatureId)
        .filter((signatureId) => !confident.has(signatureId)),
    };
  },
});

async function tombstoneSelected(
  ctx: MutationCtx,
  state: ScanState,
  signatureIds: readonly string[],
  deletedAt: number | null,
  purgeAfter: number | null,
) {
  const signatures = rowMaps(state.signatures);
  const activities = rowMaps(state.activities);
  requireUnresolvedSelections(state, signatureIds);

  let changed = 0;
  for (const signatureId of signatureIds) {
    const signature = signatures.get(signatureId);
    if (signature !== undefined) {
      const didChange = await tombstoneSignatureRow(
        ctx,
        signature,
        activities.get(signatureId) ?? null,
        deletedAt,
        purgeAfter,
      );
      if (didChange) changed += 1;
      continue;
    }
    const connection = findConnectionForSignature(state.connections, signatureId);
    const didChange = await tombstoneConnectionRow(
      ctx,
      connection,
      activities.get(signatureId),
      deletedAt,
      purgeAfter,
    );
    if (didChange) changed += 1;
  }
  return { changed };
}

function requireUnresolvedSelections(state: ScanState, signatureIds: readonly string[]): void {
  for (const signatureId of signatureIds) {
    const connection = findConnectionForSignature(state.connections, signatureId);
    if (connection === undefined || connection.toSystemId === null) continue;
    throw new ConvexError({
      code: 'RESOLVED_CONNECTION_REQUIRES_COLLAPSE',
      detail: 'Resolved wormhole removals attach to the shared collapse core in Ordered work 6.',
    });
  }
}

function needsTombstoneChange(
  row: { readonly deletedAt?: number | null },
  deletedAt: number | null,
): boolean {
  return deletedAt === null ? isTombstoned(row) : !isTombstoned(row);
}

async function tombstoneSignatureRow(
  ctx: MutationCtx,
  signature: Doc<'mapSignatures'>,
  activity: Doc<'mapSignatureActivity'> | null,
  deletedAt: number | null,
  purgeAfter: number | null,
): Promise<boolean> {
  if (!needsTombstoneChange(signature, deletedAt)) return false;
  const result = await applyKnownSignatureTombstone(
    ctx,
    signature,
    activity,
    deletedAt,
    purgeAfter,
  );
  return result.changed;
}

async function tombstoneConnectionRow(
  ctx: MutationCtx,
  connection: Doc<'mapConnections'> | undefined,
  activity: Doc<'mapSignatureActivity'> | undefined,
  deletedAt: number | null,
  purgeAfter: number | null,
): Promise<boolean> {
  if (connection === undefined || !needsTombstoneChange(connection, deletedAt)) return false;
  await ctx.db.patch(connection._id, { deletedAt, purgeAfter });
  if (deletedAt !== null && activity !== undefined) await ctx.db.delete(activity._id);
  return true;
}

function requireUndoWindow(
  state: ScanState,
  signatureIds: readonly string[],
  now: number,
): void {
  const signatures = rowMaps(state.signatures);
  for (const signatureId of signatureIds) {
    const row = signatures.get(signatureId)
      ?? findConnectionForSignature(state.connections, signatureId);
    if (
      row !== undefined
      && isTombstoned(row)
      && (typeof row.purgeAfter !== 'number' || row.purgeAfter <= now)
    ) {
      throw new ConvexError({ code: 'UNDO_WINDOW_EXPIRED' });
    }
  }
}

type SignatureSelectionMode = 'remove' | 'restore';

async function changeSignatureSelection(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  signatureIds: readonly string[],
  mode: SignatureSelectionMode,
) {
  await requireLiveSystem(ctx, mapId, systemId);
  const ids = requireBoundedSignatureIds(signatureIds);
  const state = await readScanState(ctx, mapId, systemId);
  const now = Date.now();
  if (mode === 'restore') requireUndoWindow(state, ids, now);
  const stamps = mode === 'remove'
    ? chainTombstoneStamps(now)
    : { deletedAt: null, purgeAfter: null };
  return await tombstoneSelected(ctx, state, ids, stamps.deletedAt, stamps.purgeAfter);
}

function signatureSelectionMutation(mode: SignatureSelectionMode) {
  return mutation({
    args: { mapId: v.string(), systemId: v.number(), signatureIds: v.array(v.string()) },
    handler: async (ctx, { mapId, systemId, signatureIds }) => {
      await requireMapAccess(ctx, mapId, 'edit');
      return await changeSignatureSelection(ctx, mapId, systemId, signatureIds, mode);
    },
  });
}

/** Tombstones confirmed signature rows for the canonical 24-hour undo window. */
export const removeSignatures = signatureSelectionMutation('remove');

/** Restores selected signature or unresolved-stub tombstones inside the undo window. */
export const restoreSignatures = signatureSelectionMutation('restore');

/** Watches one access-gated page of active signature-list rows for a map. */
export const watchMapSignatures = query({
  args: { mapId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { mapId, paginationOpts }) => {
    const principal = await tryMapAccess(ctx, mapId, 'view');
    if (principal === null) return deniedPage<Doc<'mapSignatures'>>();
    const page = await ctx.db
      .query('mapSignatures')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .paginate(boundedPageOptions(paginationOpts));
    return { ...page, page: page.page.filter((row) => !isTombstoned(row)) };
  },
});

/** Drains one bounded batch of expired signature tombstones. */
export const purgeExpiredSignatureTombstones = internalMutation({
  args: {},
  handler: async (ctx) => await purgeExpiredSignatures(ctx, Date.now()),
});

/** Re-exported so focused proof pins the cleanup owner's actual cap. */
export { SIGNATURE_PURGE_BATCH };
