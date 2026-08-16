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
  type ScannedRow,
} from '@/data/maps/scan-parse';
import { isWormholeTypeCode } from '@/data/eve-data/wormhole-contract';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import {
  requireMapAccess,
  requireMapAccessForUser,
  tryMapAccess,
  tryMapAccessForUser,
} from './lib/mapAccess';
import {
  findConnectionForSignature,
  readOriginConnections,
  requireLiveConnectionOnMap,
} from './lib/mapConnectionLookup';
import {
  eventActor,
  runBranchRestore,
  runCollapse,
  writeMapEvent,
  type CollapsePilotsPresent,
} from './mapAuthoring';
import {
  mergeSignatureKnowledge,
  normalizeSignatureKnowledge,
  connectionProvenanceValidator,
  scannedKindValidator,
  sigGroupValidator,
  validateSignatureKnowledge,
} from './lib/mapEntityContracts';
import {
  applyKnownSignatureTombstone,
  findMapSignature,
  findSignatureActivity,
  touchKnownSignatureActivity,
} from './lib/mapSignatures';
import {
  purgeExpiredSignatures,
  SIGNATURE_PURGE_BATCH,
} from './lib/mapSignatureCleanup';
import { stampObservationKey } from './lib/observationKey';
import { findSystem, requireSystemId } from './lib/mapSystemLookup';
import {
  readTrackedPilotSystemIds,
  TRACKED_CHARACTERS_PER_MAP_USER_CAP,
} from './mapTracking';

/** Maximum rows accepted or read for one system-level scanner transaction. */
export const MAP_SCAN_ROW_LIMIT = 256;

/** Maximum rows returned by one live signature page. */
export const MAP_SIGNATURE_PAGE_SIZE = 100;

/** Maximum destination-side rows one elimination transaction may inspect. */
export const MAP_ELIMINATION_CONNECTION_LIMIT = 128;

const eliminationDeductionValidator = v.union(
  v.object({
    signatureId: v.string(),
    typeCode: v.string(),
    provenance: v.literal('assumed'),
  }),
  v.object({
    signatureId: v.string(),
    connectionId: v.id('mapConnections'),
    provenance: v.literal('assumed'),
    expectedTypeCode: v.union(v.string(), v.null()),
  }),
);

const eliminationOutcomeValidator = v.object({
  signatureId: v.string(),
  outcome: v.union(
    v.literal('applied'),
    v.literal('unchanged'),
    v.literal('protected'),
    v.literal('stale'),
  ),
  // The row's stable per-hole observation key, so the caller can log or repair
  // the identification this outcome settled. Null when no live row owns one.
  observationKey: v.union(v.string(), v.null()),
});

const eliminationEvidenceValidator = v.object({
  canEdit: v.boolean(),
  signatures: v.array(
    v.object({
      signatureId: v.string(),
      wormholeTypeCode: v.union(v.string(), v.null()),
      typeProvenance: v.union(connectionProvenanceValidator, v.null()),
      observationKey: v.union(v.string(), v.null()),
    }),
  ),
  connections: v.array(
    v.object({
      connectionId: v.id('mapConnections'),
      wormholeTypeCode: v.union(v.string(), v.null()),
      linkedSignature: v.boolean(),
    }),
  ),
});

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

type ApplyOutcome = 'inserted' | 'updated' | 'unchanged' | 'migrated' | 'conflicted';

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

/**
 * Verifies the paste system against the caller's tracked last-known locations.
 * Accepted divergence from the client gate: the client additionally requires
 * live feed coverage (an online pilot) before offering paste at all; the
 * server verifies tracked location only, since a map editor can author the
 * same state through other gated mutations anyway.
 */
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

/**
 * Applies one clipboard row using signatureId as the only identity join.
 * Storage shape (list vs wormhole connection) and clipboard group are decided
 * after that lookup — group/name/signal are payload, not the match key.
 */
async function applyScannedRow(
  ctx: MutationCtx,
  state: ScanState,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
): Promise<ApplyOutcome> {
  const connection = findConnectionForSignature(state.connections, row.signatureId);
  // A connection (live or tombstoned) already owns this id.
  if (connection !== undefined) {
    return await applyWormholeRow(ctx, state, row, mapId, systemId, now);
  }
  // No connection yet: Wormhole group creates/migrates; otherwise list upsert/revive.
  if (row.group === 'Wormhole') {
    return await applyWormholeRow(ctx, state, row, mapId, systemId, now);
  }
  return await applyListRow(ctx, state, row, mapId, systemId, now);
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
  const key = activityKey(mapId, systemId, row.signatureId);
  const existing = signatures.get(row.signatureId);
  const knowledge = scanKnowledge(row);
  let outcome: ApplyOutcome = 'inserted';
  if (existing === undefined) {
    await ctx.db.insert('mapSignatures', {
      ...key,
      ...knowledge,
      deletedAt: null,
      purgeAfter: null,
    });
  } else if (isTombstoned(existing)) {
    // Re-paste within the undo window revives the same document identity.
    await applyKnownSignatureTombstone(ctx, existing, null, null, null);
    const merged = mergeSignatureKnowledge(existing, knowledge);
    if (merged.outcome === 'enriched') {
      await ctx.db.patch(existing._id, merged.patch);
    }
    outcome = 'updated';
  } else {
    const merged = mergeSignatureKnowledge(existing, knowledge);
    if (merged.outcome === 'enriched') {
      await ctx.db.patch(existing._id, merged.patch);
      outcome = 'updated';
    } else {
      // A refused contradiction is reported, not silently absorbed: the row
      // keeps the map's stored knowledge and the caller counts the conflict.
      outcome = merged.outcome === 'conflict' ? 'conflicted' : 'unchanged';
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

/**
 * Whether an ID-matched re-paste may revive one tombstoned unresolved stub.
 * The operator-directed ID-first revive is scoped to the SAME wormhole
 * lifetime (HC-3): a resolved collapse resurrects only through the ledger's
 * branch undo, and a passed ceiling, an expired undo window, or a conflicting
 * non-wormhole group marks the pasted ID as a NEW lifetime that stays inert
 * until the corpse purges.
 */
function mayReviveTombstonedConnection(
  connection: Doc<'mapConnections'>,
  row: ScannedRow,
  now: number,
): boolean {
  if (connection.toSystemId !== null) return false;
  const ceilingPassed =
    typeof connection.deathLatestAt === 'number' && connection.deathLatestAt <= now;
  const undoExpired =
    typeof connection.purgeAfter !== 'number' || connection.purgeAfter <= now;
  const conflictingGroup = row.group !== null && row.group !== 'Wormhole';
  return !ceilingPassed && !undoExpired && !conflictingGroup;
}

async function applyWormholeRow(
  ctx: MutationCtx,
  state: ScanState,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
): Promise<ApplyOutcome> {
  let signature = rowMaps(state.signatures).get(row.signatureId);
  let connection = findConnectionForSignature(state.connections, row.signatureId);
  let revived = false;

  if (connection !== undefined && isTombstoned(connection)) {
    // Inert corpse: no write and no activity touch (collapse already cleared
    // the companions), so the paste leaves the tombstone byte-identical.
    if (!mayReviveTombstonedConnection(connection, row, now)) return 'unchanged';
    await tombstoneConnectionRow(ctx, connection, undefined, null, null);
    connection = { ...connection, deletedAt: null, purgeAfter: null };
    revived = true;
  }
  if (signature !== undefined && isTombstoned(signature)) {
    await applyKnownSignatureTombstone(ctx, signature, null, null, null);
    signature = { ...signature, deletedAt: null, purgeAfter: null };
    revived = true;
  }

  const facts = wormholeMigrationFacts(signature, row, now);
  if (facts.outcome === 'conflict') {
    await touchScanActivity(ctx, state, mapId, systemId, row.signatureId, now);
    return 'conflicted';
  }

  const outcome = await writeWormholeConnection(
    ctx,
    connection,
    facts,
    row,
    mapId,
    systemId,
  );
  if (signature !== undefined) await ctx.db.delete(signature._id);
  await touchScanActivity(ctx, state, mapId, systemId, row.signatureId, now);
  if (revived && outcome === 'unchanged') return 'updated';
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

/** Memoizes the tracked-pilot presence read across one removal transaction. */
function trackedPresenceReader(
  ctx: MutationCtx,
  mapId: string,
): () => Promise<CollapsePilotsPresent> {
  let held: CollapsePilotsPresent | undefined;
  return async () => {
    held ??= { trackedInSystemIds: await readTrackedPilotSystemIds(ctx, mapId) };
    return held;
  };
}

async function removeConfidentRow(
  ctx: MutationCtx,
  state: ScanState,
  connection: Doc<'mapConnections'>,
  input: {
    readonly mapId: string;
    readonly signatureId: string;
    readonly actor: string;
    readonly now: number;
    readonly pilots: () => Promise<CollapsePilotsPresent>;
  },
): Promise<void> {
  if (connection.toSystemId !== null) {
    // Resolved wormhole: the shared collapse core owns stamps, ledger event,
    // and activity cleanup.
    await runCollapse(ctx, {
      mapId: input.mapId,
      connectionId: connection._id,
      actor: input.actor,
      pilotsPresent: await input.pilots(),
    });
    return;
  }
  await ctx.db.patch(connection._id, chainTombstoneStamps(input.now));
  const activity = state.activities.find((row) => row.signatureId === input.signatureId);
  if (activity !== undefined) await ctx.db.delete(activity._id);
}

async function removeConfidentRows(
  ctx: MutationCtx,
  state: ScanState,
  missingIds: readonly string[],
  mapId: string,
  systemId: number,
  actor: string,
  now: number,
): Promise<Set<string>> {
  const removed = new Set<string>();
  const removedStubIds: string[] = [];
  const pilots = trackedPresenceReader(ctx, mapId);
  // Stubs stamp before resolved collapses: the collapse core mints its shared
  // undo stamp against a fresh topology read, so stamping independent stub
  // tombstones first keeps them outside the branch's shared-stamp restore set.
  const ordered = [...missingIds].sort((left, right) => {
    const leftResolved = findConnectionForSignature(state.connections, left)?.toSystemId !== null;
    const rightResolved = findConnectionForSignature(state.connections, right)?.toSystemId !== null;
    return Number(leftResolved) - Number(rightResolved);
  });
  for (const signatureId of ordered) {
    const known = findConnectionForSignature(state.connections, signatureId);
    if (known === undefined) continue;
    // Re-read: an earlier collapse in this loop may already have tombstoned
    // this row as branch collateral.
    const connection = await ctx.db.get(known._id);
    if (
      connection === null
      || isTombstoned(connection)
      || !isConfidentMissingRemoval({
        signatureId,
        deathLatestAt: connection.deathLatestAt,
      }, now)
    ) continue;
    await removeConfidentRow(ctx, state, connection, {
      mapId,
      signatureId,
      actor,
      now,
      pilots,
    });
    removed.add(signatureId);
    if (connection.toSystemId === null) removedStubIds.push(signatureId);
  }
  if (removedStubIds.length > 0) {
    // Resolved removals ledger through the collapse core; silent stub
    // removals record their own restorable event so nothing disappears
    // without a 24-hour paper trail.
    await writeMapEvent(ctx, {
      mapId,
      at: now,
      kind: 'signatures_removed',
      actor,
      payload: { systemId, signatureIds: removedStubIds },
    });
  }
  return removed;
}

async function readDestinationConnections(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
): Promise<Doc<'mapConnections'>[]> {
  const rows = await ctx.db
    .query('mapConnections')
    .withIndex('by_map_to', (q) => q.eq('mapId', mapId).eq('toSystemId', systemId))
    .take(MAP_ELIMINATION_CONNECTION_LIMIT + 1);
  if (rows.length > MAP_ELIMINATION_CONNECTION_LIMIT) {
    throw new ConvexError({
      code: 'MAP_ELIMINATION_SCAN_LIMIT',
      detail: `Map ${mapId} exceeds the elimination destination read bound.`,
    });
  }
  return rows;
}

function endpointSide(
  connection: Doc<'mapConnections'>,
  systemId: number,
): 'from' | 'to' | null {
  if (connection.fromSystemId === systemId) return 'from';
  return connection.toSystemId === systemId ? 'to' : null;
}

function endpointTypeCode(
  connection: Doc<'mapConnections'>,
  side: 'from' | 'to',
): string | null {
  if (connection.wormholeTypeCode === null) return null;
  const typedSide = connection.typedSide ?? 'from';
  return typedSide === side ? connection.wormholeTypeCode : null;
}

function endpointOwnsSignature(
  connection: Doc<'mapConnections'>,
  side: 'from' | 'to',
): boolean {
  return side === 'from'
    ? connection.fromSignatureId !== undefined
    : connection.toSignatureId !== undefined;
}

async function readEliminationConnections(
  ctx: QueryCtx,
  mapId: string,
  systemId: number,
): Promise<{
  readonly from: Doc<'mapConnections'>[];
  readonly touching: Doc<'mapConnections'>[];
}> {
  const [from, to] = await Promise.all([
    readOriginConnections(ctx, mapId, systemId),
    readDestinationConnections(ctx, mapId, systemId),
  ]);
  const touching = new Map(
    [...from, ...to].map((connection) => [connection._id, connection]),
  );
  return { from, touching: [...touching.values()] };
}

/** Reads bounded live endpoint facts for server-owned signature elimination. */
export const eliminationEvidence = internalQuery({
  args: { userId: v.string(), mapId: v.string(), systemId: v.number() },
  returns: eliminationEvidenceValidator,
  handler: async (ctx, { userId, mapId, systemId }) => {
    const principal = await tryMapAccessForUser(ctx, mapId, userId, 'edit');
    if (principal === null) {
      return { canEdit: false as const, signatures: [], connections: [] };
    }
    requireSystemId(systemId);
    const system = await findSystem(ctx, mapId, systemId);
    if (system === null || isTombstoned(system)) {
      return { canEdit: true as const, signatures: [], connections: [] };
    }

    const rows = await readEliminationConnections(ctx, mapId, systemId);
    const liveFrom = rows.from.filter((connection) => !isTombstoned(connection));
    const signatures = liveFrom.flatMap((connection) => {
      const signatureId = connection.fromSignatureId;
      return connection.toSystemId !== null || signatureId === undefined
        ? []
        : [{
            signatureId,
            wormholeTypeCode: connection.wormholeTypeCode,
            typeProvenance: connection.typeProvenance ?? null,
            observationKey: connection.observationKey ?? null,
          }];
    });
    const connections = rows.touching
      .filter(
        (connection) => connection.toSystemId !== null && !isTombstoned(connection),
      )
      .flatMap((connection) => {
        const side = endpointSide(connection, systemId);
        return side === null
          ? []
          : [{
              connectionId: connection._id,
              wormholeTypeCode: endpointTypeCode(connection, side),
              linkedSignature: endpointOwnsSignature(connection, side),
            }];
      });
    return { canEdit: true as const, signatures, connections };
  },
});

function requireEliminationDeductions(
  deductions: readonly {
    readonly signatureId: string;
    readonly typeCode?: string;
    readonly connectionId?: string;
  }[],
): void {
  if (deductions.length === 0 || deductions.length > MAP_SCAN_ROW_LIMIT) {
    throw new ConvexError({ code: 'INVALID_ELIMINATION_SIZE' });
  }
  const signatureIds = new Set<string>();
  for (const deduction of deductions) {
    if (
      !isScannerSignatureId(deduction.signatureId)
      || signatureIds.has(deduction.signatureId)
      || (
        deduction.typeCode !== undefined
        && !isWormholeTypeCode(deduction.typeCode)
      )
    ) {
      throw new ConvexError({ code: 'INVALID_ELIMINATION_DEDUCTION' });
    }
    signatureIds.add(deduction.signatureId);
  }
}

type EliminationOutcome = {
  readonly signatureId: string;
  readonly outcome: 'applied' | 'unchanged' | 'protected' | 'stale';
  readonly observationKey: string | null;
};

async function applyTypeDeduction(
  ctx: MutationCtx,
  source: Doc<'mapConnections'> | undefined,
  signatureId: string,
  typeCode: string,
): Promise<EliminationOutcome> {
  if (source === undefined || source.toSystemId !== null || isTombstoned(source)) {
    return { signatureId, outcome: 'stale', observationKey: null };
  }
  const observationKey = source.observationKey ?? null;
  if (
    source.wormholeTypeCode === typeCode
    && source.typeProvenance === 'assumed'
    && source.typedSide === 'from'
  ) {
    return { signatureId, outcome: 'unchanged', observationKey };
  }
  if (
    source.wormholeTypeCode !== null
    && source.typeProvenance !== 'assumed'
  ) {
    return { signatureId, outcome: 'protected', observationKey };
  }
  // A deduced identity is observation-eligible (ruling D-B), so it stamps the
  // row's dedupe key through the same owner the manual setter uses.
  const stamped = stampObservationKey(source.observationKey);
  await ctx.db.patch(source._id, {
    wormholeTypeCode: typeCode,
    typedSide: 'from',
    typeProvenance: 'assumed',
    ...stamped.patch,
  });
  return { signatureId, outcome: 'applied', observationKey: stamped.observationKey };
}

async function applyLinkDeduction(
  ctx: MutationCtx,
  source: Doc<'mapConnections'> | undefined,
  target: Doc<'mapConnections'> | undefined,
  systemId: number,
  signatureId: string,
  expectedTypeCode: string | null,
): Promise<EliminationOutcome> {
  if (
    source === undefined
    || source.toSystemId !== null
    || isTombstoned(source)
    || target === undefined
    || target.toSystemId === null
    || isTombstoned(target)
  ) {
    return { signatureId, outcome: 'stale', observationKey: null };
  }
  const observationKey = source.observationKey ?? null;
  // Evidence was read in a prior transaction. Refuse when the stub's type no
  // longer matches the decision — a concurrent human retype must win.
  if ((source.wormholeTypeCode ?? null) !== expectedTypeCode) {
    return { signatureId, outcome: 'stale', observationKey };
  }
  const side = endpointSide(target, systemId);
  if (side === null) return { signatureId, outcome: 'stale', observationKey };
  const current = side === 'from' ? target.fromSignatureId : target.toSignatureId;
  if (current !== undefined) {
    return {
      signatureId,
      outcome: current === signatureId ? 'unchanged' : 'protected',
      observationKey,
    };
  }
  // Carry human-entered stub knowledge onto the resolved row before the stub
  // document dies — inference must not erase a person's mass/size/lifetime.
  const knowledge = linkKnowledgePatch(source, target);
  await ctx.db.patch(
    target._id,
    {
      ...(side === 'from'
        ? { fromSignatureId: signatureId }
        : { toSignatureId: signatureId }),
      ...knowledge,
    },
  );
  // The stub row and its dedupe key die here: the identity now belongs to the
  // resolved connection, which carries its own key through the jump channel.
  await ctx.db.delete(source._id);
  return { signatureId, outcome: 'applied', observationKey };
}

/** Copies only unset target fields from a stub that is about to be deleted. */
function linkKnowledgePatch(
  source: Doc<'mapConnections'>,
  target: Doc<'mapConnections'>,
): Partial<Doc<'mapConnections'>> {
  const patch: Partial<Doc<'mapConnections'>> = {};
  if (target.massState === null && source.massState !== null) {
    patch.massState = source.massState;
    if (source.observedMassAtStateKg !== undefined) {
      patch.observedMassAtStateKg = source.observedMassAtStateKg;
    }
  }
  if (target.shipSize === null && source.shipSize !== null) {
    patch.shipSize = source.shipSize;
  }
  // Carry only when the target never recorded a lifetime decision. A timestamped
  // `lifeStage: null` is an explicit Unset — on the target it must win; on the
  // dying stub it must survive onto an unobserved resolved row.
  if (
    target.lifeStage == null
    && target.lifeStageObservedAt == null
    && (source.lifeStage != null || source.lifeStageObservedAt != null)
  ) {
    patch.lifeStage = source.lifeStage ?? null;
    if (source.lifeStageObservedAt !== undefined) {
      patch.lifeStageObservedAt = source.lifeStageObservedAt;
    }
  }
  if (
    target.deathEarliestAt === undefined
    && source.deathEarliestAt !== undefined
  ) {
    patch.deathEarliestAt = source.deathEarliestAt;
    patch.deathLatestAt = source.deathLatestAt;
  }
  return patch;
}

/** Atomically revalidates and applies one assumed-tier deduction batch. */
export const applyEliminationDeductions = internalMutation({
  args: {
    userId: v.string(),
    mapId: v.string(),
    systemId: v.number(),
    deductions: v.array(eliminationDeductionValidator),
  },
  returns: v.array(eliminationOutcomeValidator),
  handler: async (ctx, { userId, mapId, systemId, deductions }) => {
    await requireMapAccessForUser(ctx, mapId, userId, 'edit');
    requireSystemId(systemId);
    requireEliminationDeductions(deductions);
    const system = await findSystem(ctx, mapId, systemId);
    if (system === null || isTombstoned(system)) {
      return deductions.map(({ signatureId }) => ({
        signatureId,
        outcome: 'stale' as const,
        observationKey: null,
      }));
    }
    const rows = await readEliminationConnections(ctx, mapId, systemId);
    const bySignature = new Map(
      rows.from.flatMap((connection) => {
        const signatureId = connection.fromSignatureId;
        return signatureId === undefined ? [] : [[signatureId, connection] as const];
      }),
    );
    const byId = new Map(rows.touching.map((connection) => [connection._id, connection]));

    const outcomes: EliminationOutcome[] = [];
    for (const deduction of deductions) {
      const source = bySignature.get(deduction.signatureId);
      outcomes.push(
        'typeCode' in deduction
          ? await applyTypeDeduction(
              ctx,
              source,
              deduction.signatureId,
              deduction.typeCode,
            )
          : await applyLinkDeduction(
              ctx,
              source,
              byId.get(deduction.connectionId),
              systemId,
              deduction.signatureId,
              deduction.expectedTypeCode,
            ),
      );
    }
    return outcomes;
  },
});

/**
 * Attaches one unresolved scanned stub to a known inbound line the operator
 * picked in Leads to. Reuses the elimination link writer so mass, size, and
 * lifetime carry the same way a deduced link would — without inferring which
 * K162 is the way home.
 */
export const linkStubToResolvedConnection = mutation({
  args: {
    mapId: v.string(),
    stubConnectionId: v.id('mapConnections'),
    resolvedConnectionId: v.id('mapConnections'),
  },
  handler: async (ctx, { mapId, stubConnectionId, resolvedConnectionId }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    const stub = await requireLiveConnectionOnMap(ctx, mapId, stubConnectionId);
    const target = await requireLiveConnectionOnMap(
      ctx,
      mapId,
      resolvedConnectionId,
    );
    const signatureId = stub.fromSignatureId;
    if (signatureId === undefined) {
      throw new ConvexError({ code: 'UNKNOWN_SIGNATURE' });
    }
    const outcome = await applyLinkDeduction(
      ctx,
      stub,
      target,
      stub.fromSystemId,
      signatureId,
      stub.wormholeTypeCode ?? null,
    );
    if (outcome.outcome !== 'applied' && outcome.outcome !== 'unchanged') {
      throw new ConvexError({
        code: 'INVALID_REASSOCIATION',
        detail: `Cannot link stub ${stubConnectionId} onto ${resolvedConnectionId}.`,
      });
    }
    return { outcome: outcome.outcome };
  },
});

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
    const counts = { inserted: 0, updated: 0, unchanged: 0, migrated: 0, conflicted: 0 };

    for (const row of normalizedRows) {
      const outcome = await applyScannedRow(ctx, state, row, mapId, systemId, now);
      counts[outcome] += 1;
    }

    const confident = await removeConfidentRows(
      ctx,
      state,
      missingRows.map((row) => row.signatureId),
      mapId,
      systemId,
      await eventActor(ctx),
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

async function stampIdentifiedWormholeType(
  ctx: MutationCtx,
  connectionId: Id<'mapConnections'>,
  wormholeTypeCode: string | null | undefined,
): Promise<void> {
  if (!wormholeTypeCode) return;
  if (!isWormholeTypeCode(wormholeTypeCode)) {
    throw new ConvexError({
      code: 'INVALID_WORMHOLE_CODE',
      detail: `Unknown wormhole code "${wormholeTypeCode}".`,
    });
  }
  const connection = await ctx.db.get(connectionId);
  if (connection === null) return;
  if (
    connection.wormholeTypeCode === wormholeTypeCode
    && connection.typeProvenance === 'human'
    && connection.observationKey !== undefined
  ) {
    return;
  }
  await ctx.db.patch(connectionId, {
    wormholeTypeCode,
    typedSide: connection.typedSide ?? 'from',
    typeProvenance: 'human',
    pendingCandidates: undefined,
    pendingResolutionCharacterId: undefined,
    ...stampObservationKey(connection.observationKey).patch,
  });
}

async function identifyWormholeRow(
  ctx: MutationCtx,
  state: ScanState,
  signature: Doc<'mapSignatures'>,
  mapId: string,
  systemId: number,
  wormholeTypeCode: string | null | undefined,
): Promise<{ changed: boolean; connectionId: Id<'mapConnections'> }> {
  if ((signature.kind ?? 'signature') !== 'signature') {
    throw new ConvexError({ code: 'ANOMALY_CANNOT_BE_WORMHOLE' });
  }
  await applyWormholeRow(
    ctx,
    state,
    {
      signatureId: signature.signatureId,
      kind: 'signature',
      group: 'Wormhole',
      name: signature.typeName,
      signalPct: signature.signalPct ?? null,
    },
    mapId,
    systemId,
    Date.now(),
  );
  const connection = findConnectionForSignature(
    await readOriginConnections(ctx, mapId, systemId),
    signature.signatureId,
  );
  if (connection === undefined) {
    throw new ConvexError({ code: 'SIGNATURE_MIGRATION_FAILED' });
  }
  await stampIdentifiedWormholeType(ctx, connection._id, wormholeTypeCode);
  return {
    changed: (signature.group ?? null) !== 'Wormhole',
    connectionId: connection._id,
  };
}

/**
 * Identifies one unresolved list row. Wormhole identification reuses the same
 * signature-to-connection convergence path as scanner paste.
 */
export const identifySignature = mutation({
  args: {
    mapId: v.string(),
    systemId: v.number(),
    signatureId: v.string(),
    group: sigGroupValidator,
    wormholeTypeCode: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { mapId, systemId, signatureId, group, wormholeTypeCode }) => {
    await requireMapAccess(ctx, mapId, 'edit');
    await requireLiveSystem(ctx, mapId, systemId);
    const [normalizedId] = requireBoundedSignatureIds([signatureId]);
    if (normalizedId === undefined) {
      throw new ConvexError({ code: 'INVALID_SIGNATURE_ID' });
    }
    const state = await readScanState(ctx, mapId, systemId);
    const signature = rowMaps(state.signatures).get(normalizedId);
    if (signature === undefined || isTombstoned(signature)) {
      if (group === 'Wormhole') {
        const existing = findConnectionForSignature(
          await readOriginConnections(ctx, mapId, systemId),
          normalizedId,
        );
        if (existing !== undefined) {
          await stampIdentifiedWormholeType(ctx, existing._id, wormholeTypeCode);
          return { changed: false, connectionId: existing._id };
        }
      }
      throw new ConvexError({ code: 'UNKNOWN_SIGNATURE' });
    }
    const currentGroup = signature.group ?? null;
    if (currentGroup !== null && currentGroup !== group) {
      throw new ConvexError({ code: 'SIGNATURE_ALREADY_IDENTIFIED' });
    }
    if (group === 'Wormhole') {
      return identifyWormholeRow(
        ctx,
        state,
        signature,
        mapId,
        systemId,
        wormholeTypeCode,
      );
    }
    if (currentGroup === group) return { changed: false, connectionId: null };
    await ctx.db.patch(signature._id, { group });
    return { changed: true, connectionId: null };
  },
});

interface SelectionWrite {
  readonly mode: SignatureSelectionMode;
  readonly deletedAt: number | null;
  readonly purgeAfter: number | null;
  readonly actor: string;
  readonly at: number;
}

/**
 * Removes or restores one selected resolved wormhole row through the shared
 * collapse core and its shared-stamp branch undo. Unresolved stubs never reach
 * this arm — they tombstone as single rows in the caller's first pass.
 */
async function changeSelectedResolvedConnection(
  ctx: MutationCtx,
  mapId: string,
  connection: Doc<'mapConnections'>,
  write: SelectionWrite,
  pilots: () => Promise<CollapsePilotsPresent>,
): Promise<boolean> {
  // Re-read: an earlier selection in this loop may already have collapsed or
  // restored this row as shared-stamp branch collateral.
  const fresh = await ctx.db.get(connection._id);
  if (fresh === null) return false;
  if (write.mode === 'remove') {
    if (isTombstoned(fresh)) return false;
    await runCollapse(ctx, {
      mapId,
      connectionId: fresh._id,
      actor: write.actor,
      pilotsPresent: await pilots(),
    });
    return true;
  }
  if (!isTombstoned(fresh)) return false;
  await runBranchRestore(ctx, { mapId, connectionId: fresh._id, actor: write.actor });
  return true;
}

interface SingleRowPass {
  changed: number;
  readonly changedRowIds: string[];
  readonly resolved: Doc<'mapConnections'>[];
}

/**
 * First selection pass: stamps list rows and unresolved stubs, deferring
 * resolved connections. Single-row tombstones must stamp before resolved
 * collapses/restores — the collapse core mints its shared undo stamp against
 * a fresh topology read, so stamping first keeps independent rows outside the
 * branch's shared-stamp restore set.
 */
async function tombstoneSingleRows(
  ctx: MutationCtx,
  state: ScanState,
  signatureIds: readonly string[],
  write: SelectionWrite,
): Promise<SingleRowPass> {
  const signatures = rowMaps(state.signatures);
  const activities = rowMaps(state.activities);
  const pass: SingleRowPass = { changed: 0, changedRowIds: [], resolved: [] };
  for (const signatureId of signatureIds) {
    const signature = signatures.get(signatureId);
    if (signature !== undefined) {
      const didChange = await tombstoneSignatureRow(
        ctx,
        signature,
        activities.get(signatureId) ?? null,
        write.deletedAt,
        write.purgeAfter,
      );
      if (didChange) {
        pass.changed += 1;
        pass.changedRowIds.push(signatureId);
      }
      continue;
    }
    const connection = findConnectionForSignature(state.connections, signatureId);
    if (connection === undefined) continue;
    if (connection.toSystemId !== null) {
      pass.resolved.push(connection);
      continue;
    }
    const didChange = await tombstoneConnectionRow(
      ctx,
      connection,
      activities.get(signatureId),
      write.deletedAt,
      write.purgeAfter,
    );
    if (didChange) {
      pass.changed += 1;
      pass.changedRowIds.push(signatureId);
    }
  }
  return pass;
}

async function tombstoneSelected(
  ctx: MutationCtx,
  state: ScanState,
  mapId: string,
  systemId: number,
  signatureIds: readonly string[],
  write: SelectionWrite,
) {
  const pilots = trackedPresenceReader(ctx, mapId);
  const pass = await tombstoneSingleRows(ctx, state, signatureIds, write);
  let changed = pass.changed;
  for (const connection of pass.resolved) {
    const didChange = await changeSelectedResolvedConnection(
      ctx,
      mapId,
      connection,
      write,
      pilots,
    );
    if (didChange) changed += 1;
  }
  if (pass.changedRowIds.length > 0) {
    // Resolved rows ledger through the collapse core; list rows and stubs
    // record their own restorable event so every removal (and its undo)
    // leaves a 24-hour paper trail.
    await writeMapEvent(ctx, {
      mapId,
      at: write.at,
      kind: write.mode === 'remove' ? 'signatures_removed' : 'signatures_restored',
      actor: write.actor,
      payload: { systemId, signatureIds: pass.changedRowIds },
    });
  }
  return { changed };
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

/**
 * Resolves only the requested identities through their exact compound indexes.
 * Removal and restore must stay available even when a system exceeds the
 * whole-system scan bound — cleanup is the remedy for an over-bound system,
 * so it must never be gated behind the bound it relieves.
 */
async function readSelectionState(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  signatureIds: readonly string[],
): Promise<ScanState> {
  const [signatures, activities, connections] = await Promise.all([
    Promise.all(
      signatureIds.map((signatureId) =>
        findMapSignature(ctx, { mapId, systemId, signatureId }),
      ),
    ),
    Promise.all(
      signatureIds.map((signatureId) =>
        findSignatureActivity(ctx, { mapId, systemId, signatureId }),
      ),
    ),
    readOriginConnections(ctx, mapId, systemId),
  ]);
  return {
    signatures: signatures.filter((row) => row !== null),
    connections,
    activities: activities.filter((row) => row !== null),
  };
}

async function changeSignatureSelection(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  signatureIds: readonly string[],
  mode: SignatureSelectionMode,
) {
  await requireLiveSystem(ctx, mapId, systemId);
  const ids = requireBoundedSignatureIds(signatureIds);
  const state = await readSelectionState(ctx, mapId, systemId, ids);
  const now = Date.now();
  if (mode === 'restore') requireUndoWindow(state, ids, now);
  const stamps = mode === 'remove'
    ? chainTombstoneStamps(now)
    : { deletedAt: null, purgeAfter: null };
  return await tombstoneSelected(ctx, state, mapId, systemId, ids, {
    mode,
    deletedAt: stamps.deletedAt,
    purgeAfter: stamps.purgeAfter,
    actor: await eventActor(ctx),
    at: now,
  });
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
