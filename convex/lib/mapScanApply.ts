import { ConvexError, type Infer } from 'convex/values';
import { isTombstoned } from '@/data/maps/chain-contract';
import { isWormholeTypeCode } from '@/data/eve-data/wormhole-contract';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { absorbDoorKnowledge } from '@/data/maps/connection-door-destinations';
import { connectionTypePatch } from '@/data/maps/connection-door-types';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import {
  findLocalSignatureConnection,
  findPasteConnection,
  readTouchingConnections,
} from './mapConnectionLookup';
import {
  applyKnownSignatureTombstone,
  touchKnownSignatureActivity,
} from './mapSignatures';
import {
  mergeSignatureKnowledge,
  normalizeSignatureKnowledge,
  sigGroupValidator,
  validateSignatureKnowledge,
} from './mapEntityContracts';
import { stampObservationKey } from './observationKey';
import { findSystem, requireSystemId } from './mapSystemLookup';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from '../mapTracking';
import {
  endpointSide,
  leadsNotePatch,
  readScanState,
  requireBoundedSignatureIds,
  requireLiveSystem,
  rowMaps,
  tombstoneConnectionRow,
  type ScanState,
} from './mapScanState';

export type ApplyOutcome = 'inserted' | 'updated' | 'unchanged' | 'migrated' | 'conflicted';

type WormholeWrite = {
  readonly outcome: ApplyOutcome;
  readonly connectionId: Id<'mapConnections'> | undefined;
};

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

export async function applyScannedRow(
  ctx: MutationCtx,
  state: ScanState,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
): Promise<ApplyOutcome> {
  const connection = findPasteConnection(state.connections, systemId, row.signatureId);
  if (connection !== undefined) {
    return (await applyWormholeRow(ctx, state, row, mapId, systemId, now)).outcome;
  }
  if (row.group === 'Wormhole') {
    return (await applyWormholeRow(ctx, state, row, mapId, systemId, now)).outcome;
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
): Promise<Id<'mapConnections'>> {
  return await ctx.db.insert('mapConnections', {
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
): Promise<WormholeWrite> {
  if (connection === undefined) {
    const connectionId = await insertWormholeConnection(
      ctx,
      mapId,
      systemId,
      { ...row, signalPct: facts.signalPct },
      facts.firstSeenAt,
      facts.wormholeTypeCode,
    );
    return { outcome: facts.migrated ? 'migrated' : 'inserted', connectionId };
  }
  const patch = {
    ...connectionSignalPatch(connection, facts.signalPct),
    ...(connection.firstSeenAt === undefined ? { firstSeenAt: connection._creationTime } : {}),
  };
  if (Object.keys(patch).length > 0) await ctx.db.patch(connection._id, patch);
  if (facts.migrated) return { outcome: 'migrated', connectionId: connection._id };
  return {
    outcome: Object.keys(patch).length > 0 ? 'updated' : 'unchanged',
    connectionId: connection._id,
  };
}

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
  if (!mayReviveTombstonedConnection(connection, row, now)) return 'unchanged';
  await tombstoneConnectionRow(ctx, connection, undefined, null, null);
  return { ...connection, deletedAt: null, purgeAfter: null };
}

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
): Promise<WormholeWrite> {
  const absorbed = await absorbDuplicateOriginStub(
    ctx,
    state,
    inbound,
    systemId,
    signatureId,
  );
  if (signature !== undefined) await ctx.db.delete(signature._id);
  await touchScanActivity(ctx, state, mapId, systemId, signatureId, now);
  return {
    outcome: absorbed || revived ? 'updated' : 'unchanged',
    connectionId: inbound._id,
  };
}

async function applyWormholeRow(
  ctx: MutationCtx,
  state: ScanState,
  row: ScannedRow,
  mapId: string,
  systemId: number,
  now: number,
): Promise<WormholeWrite> {
  let signature = rowMaps(state.signatures).get(row.signatureId);
  const found = findPasteConnection(state.connections, systemId, row.signatureId);
  let connection: Doc<'mapConnections'> | undefined;
  let revived = false;
  if (found !== undefined) {
    const revivedConnection = await revivePasteConnection(ctx, found, row, now);
    if (revivedConnection === 'unchanged') {
      return { outcome: 'unchanged', connectionId: found._id };
    }
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
): Promise<WormholeWrite> {
  const facts = wormholeMigrationFacts(signature, row, now);
  if (facts.outcome === 'conflict') {
    await touchScanActivity(ctx, state, mapId, systemId, row.signatureId, now);
    return { outcome: 'conflicted', connectionId: connection?._id };
  }
  const written = await writeWormholeConnection(
    ctx,
    connection,
    facts,
    row,
    mapId,
    systemId,
  );
  if (signature !== undefined) await ctx.db.delete(signature._id);
  await touchScanActivity(ctx, state, mapId, systemId, row.signatureId, now);
  if (revived && written.outcome === 'unchanged') {
    return { outcome: 'updated', connectionId: written.connectionId };
  }
  return written;
}

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
  const typePatch = connectionTypePatch(connection, 'from', wormholeTypeCode);
  if (
    connection.fromWormholeTypeCode === typePatch.fromWormholeTypeCode
    && connection.toWormholeTypeCode === typePatch.toWormholeTypeCode
    && connection.typeProvenance === 'human'
    && connection.observationKey !== undefined
  ) {
    return;
  }
  await ctx.db.patch(connectionId, {
    ...typePatch,
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
  const written = await applyWormholeRow(
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
  if (written.connectionId === undefined) {
    throw new ConvexError({ code: 'SIGNATURE_MIGRATION_FAILED' });
  }
  await stampIdentifiedWormholeType(ctx, written.connectionId, wormholeTypeCode);
  return {
    changed: (signature.group ?? null) !== 'Wormhole',
    connectionId: written.connectionId,
  };
}

export async function identifyScannedSignature(
  ctx: MutationCtx,
  mapId: string,
  systemId: number,
  signatureId: string,
  group: Infer<typeof sigGroupValidator>,
  wormholeTypeCode: string | null | undefined,
): Promise<{ changed: boolean; connectionId: Id<'mapConnections'> | null }> {
  await requireLiveSystem(ctx, mapId, systemId);
  const [normalizedId] = requireBoundedSignatureIds([signatureId]);
  if (normalizedId === undefined) {
    throw new ConvexError({ code: 'INVALID_SIGNATURE_ID' });
  }
  const state = await readScanState(ctx, mapId, systemId);
  const signature = rowMaps(state.signatures).get(normalizedId);
  if (signature === undefined || isTombstoned(signature)) {
    if (group === 'Wormhole') {
      const existing = findLocalSignatureConnection(
        await readTouchingConnections(ctx, mapId, systemId),
        systemId,
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
}
