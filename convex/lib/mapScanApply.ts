// Clipboard apply: paste merge, wormhole write/migration/stub-absorb, and
// confident-missing removal.
import { ConvexError } from 'convex/values';
import { chainTombstoneStamps, isTombstoned } from '@/data/maps/chain-contract';
import { isConfidentMissingRemoval } from '@/data/maps/signature-lifecycle';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { absorbDoorKnowledge } from '@/data/maps/connection-door-destinations';
import { connectionTypePatch } from '@/data/maps/connection-door-types';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import {
  runCollapse,
  writeMapEvent,
  type CollapsePilotsPresent,
} from '../mapAuthoring';
import { findPasteConnection } from './mapConnectionLookup';
import {
  applyKnownSignatureTombstone,
  touchKnownSignatureActivity,
} from './mapSignatures';
import {
  mergeSignatureKnowledge,
  normalizeSignatureKnowledge,
  validateSignatureKnowledge,
} from './mapEntityContracts';
import { findSystem, requireSystemId } from './mapSystemLookup';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from '../mapTracking';
import {
  endpointSide,
  leadsNotePatch,
  rowMaps,
  tombstoneConnectionRow,
  trackedPresenceReader,
  type ScanState,
} from './mapScanState';

type ApplyOutcome = 'inserted' | 'updated' | 'unchanged' | 'migrated' | 'conflicted';

/**
 * Confirms the paste system is live on the map and one of the caller's
 * tracked characters is there. Live-feed / online-pilot coverage is a client
 * offer rule; this mutation checks tracked location only.
 */
export async function requireTrackedSystem(
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
    { mapId, systemId, signatureId },
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
export async function applyScannedRow(
  ctx: MutationCtx,
  state: ScanState,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
): Promise<ApplyOutcome> {
  const connection = findPasteConnection(state.connections, systemId, row.signatureId);
  // A live door or revivable stub already owns this id.
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
  const key = { mapId, systemId, signatureId: row.signatureId };
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
    ...connectionTypePatch({}, 'from', wormholeTypeCode),
    massState: null,
    shipSize: null,
    eolAt: null,
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
 * Deletes a leftover stub in this system that duplicates an incoming mouth
 * already carrying this scanner ID. Re-paste after linking a K162 must not
 * leave a second ghost.
 */
async function absorbDuplicateOriginStub(
  ctx: MutationCtx,
  state: ScanState,
  inbound: Doc<'mapConnections'>,
  systemId: number,
  signatureId: string,
): Promise<boolean> {
  const duplicate = state.connections.find((row) =>
    row._id !== inbound._id
    && row.fromSystemId === systemId
    && row.fromSignatureId === signatureId
    && row.toSystemId === null
    && !isTombstoned(row),
  );
  if (duplicate === undefined) return false;
  const side = endpointSide(inbound, systemId);
  if (side !== null) {
    const knowledge = {
      ...absorbDoorKnowledge(inbound, duplicate, side),
      ...leadsNotePatch(inbound, duplicate.fromDestinationSystemId, side),
    };
    if (Object.keys(knowledge).length > 0) {
      await ctx.db.patch(inbound._id, knowledge);
    }
  }
  await ctx.db.delete(duplicate._id);
  return true;
}

/**
 * Whether an ID-matched re-paste may revive one tombstoned unresolved stub.
 * A resolved collapse returns only through ledger branch undo; paste skips
 * that corpse so the same id can start a new stub. A passed ceiling, an
 * expired undo window, or a conflicting non-wormhole group refuses revive.
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

async function revivePasteConnection(
  ctx: MutationCtx,
  connection: Doc<'mapConnections'>,
  row: ScannedRow,
  now: number,
): Promise<Doc<'mapConnections'> | 'unchanged'> {
  if (!isTombstoned(connection)) return connection;
  // Inert corpse: no write and no activity touch (collapse already cleared
  // the companions), so the paste leaves the tombstone byte-identical.
  if (!mayReviveTombstonedConnection(connection, row, now)) return 'unchanged';
  await tombstoneConnectionRow(ctx, connection, undefined, null, null);
  return { ...connection, deletedAt: null, purgeAfter: null };
}

/** Re-paste against an incoming mouth: keep one hallway row, drop a leftover stub. */
async function applyInboundPaste(
  ctx: MutationCtx,
  state: ScanState,
  inbound: Doc<'mapConnections'>,
  signature: Doc<'mapSignatures'> | undefined,
  mapId: string,
  systemId: number,
  signatureId: string,
  now: number,
  revived: boolean,
): Promise<ApplyOutcome> {
  const absorbed = await absorbDuplicateOriginStub(
    ctx,
    state,
    inbound,
    systemId,
    signatureId,
  );
  if (signature !== undefined) await ctx.db.delete(signature._id);
  await touchScanActivity(ctx, state, mapId, systemId, signatureId, now);
  if (absorbed || revived) return 'updated';
  return 'unchanged';
}

/** Writes or migrates one wormhole paste row, including inbound stub absorb. */
export async function applyWormholeRow(
  ctx: MutationCtx,
  state: ScanState,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
): Promise<ApplyOutcome> {
  let signature = rowMaps(state.signatures).get(row.signatureId);
  const found = findPasteConnection(state.connections, systemId, row.signatureId);
  let connection: Doc<'mapConnections'> | undefined;
  let revived = false;
  if (found !== undefined) {
    const revivedConnection = await revivePasteConnection(ctx, found, row, now);
    if (revivedConnection === 'unchanged') return 'unchanged';
    connection = revivedConnection;
    revived = isTombstoned(found);
    if (endpointSide(connection, systemId) === 'to') {
      return await applyInboundPaste(
        ctx,
        state,
        connection,
        signature,
        mapId,
        systemId,
        row.signatureId,
        now,
        revived,
      );
    }
  }
  if (signature !== undefined && isTombstoned(signature)) {
    await applyKnownSignatureTombstone(ctx, signature, null, null, null);
    signature = { ...signature, deletedAt: null, purgeAfter: null };
    revived = true;
  }
  return await writeFreshWormholeRow(
    ctx,
    state,
    signature,
    connection,
    row,
    mapId,
    systemId,
    now,
    revived,
  );
}

async function writeFreshWormholeRow(
  ctx: MutationCtx,
  state: ScanState,
  signature: Doc<'mapSignatures'> | undefined,
  connection: Doc<'mapConnections'> | undefined,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
  revived: boolean,
): Promise<ApplyOutcome> {
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

/** Lifecycle owner in this system for confident-missing; never the incoming mouth of a hallway. */
function findOriginLifecycleConnection(
  rows: readonly Doc<'mapConnections'>[],
  systemId: number,
  signatureId: string,
): Doc<'mapConnections'> | undefined {
  const matches = rows.filter(
    (row) => row.fromSystemId === systemId && row.fromSignatureId === signatureId,
  );
  return matches.find((row) => !isTombstoned(row)) ?? matches[0];
}

/** Live list rows plus origin-side wormhole doors used for missing classification. */
export function liveLifecycleRows(state: ScanState, systemId: number) {
  const signatures = state.signatures
    .filter((row) => !isTombstoned(row))
    .map((row) => ({ signatureId: row.signatureId, kind: row.kind }));
  const connections = state.connections
    .filter((row) =>
      !isTombstoned(row)
      && row.fromSystemId === systemId
      && row.fromSignatureId !== undefined,
    )
    .flatMap((row) => row.fromSignatureId === undefined ? [] : [{
      signatureId: row.fromSignatureId,
      kind: 'signature' as const,
      deathLatestAt: row.deathLatestAt,
    }]);
  const byId = new Map([...signatures, ...connections].map((row) => [row.signatureId, row]));
  return [...byId.values()];
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

/** Tombstones confident-missing origin doors; resolved holes go through collapse. */
export async function removeConfidentRows(
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
    const leftResolved = findOriginLifecycleConnection(
      state.connections,
      systemId,
      left,
    )?.toSystemId !== null;
    const rightResolved = findOriginLifecycleConnection(
      state.connections,
      systemId,
      right,
    )?.toSystemId !== null;
    return Number(leftResolved) - Number(rightResolved);
  });
  for (const signatureId of ordered) {
    const known = findOriginLifecycleConnection(state.connections, systemId, signatureId);
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
