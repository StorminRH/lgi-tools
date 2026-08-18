// Selection tombstone/restore and confident-missing removal. Both stamp
// independent stubs before resolved collapses so those stubs stay outside the
// collapse core's shared-stamp restore set.
import { ConvexError } from 'convex/values';
import { chainTombstoneStamps, isTombstoned } from '@/data/maps/chain-contract';
import { isConfidentMissingRemoval } from '@/data/maps/signature-lifecycle';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import {
  eventActor,
  runBranchRestore,
  runCollapse,
  writeMapEvent,
  type CollapsePilotsPresent,
} from '../mapAuthoring';
import { findLocalSignatureConnection, readTouchingConnections } from './mapConnectionLookup';
import {
  applyKnownSignatureTombstone,
  findMapSignature,
  findSignatureActivity,
} from './mapSignatures';
import {
  needsTombstoneChange,
  requireBoundedSignatureIds,
  requireLiveSystem,
  rowMaps,
  tombstoneConnectionRow,
  trackedPresenceReader,
  type ScanState,
} from './mapScanState';

/** Operator selection: tombstone confirmed rows or restore them inside the undo window. */
export type SignatureSelectionMode = 'remove' | 'restore';

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
  systemId: number,
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
    const connection = findLocalSignatureConnection(
      state.connections,
      systemId,
      signatureId,
    );
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
  const pass = await tombstoneSingleRows(ctx, state, systemId, signatureIds, write);
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

function requireUndoWindow(
  state: ScanState,
  systemId: number,
  signatureIds: readonly string[],
  now: number,
): void {
  const signatures = rowMaps(state.signatures);
  for (const signatureId of signatureIds) {
    const row = signatures.get(signatureId)
      ?? findLocalSignatureConnection(state.connections, systemId, signatureId);
    if (
      row !== undefined
      && isTombstoned(row)
      && (typeof row.purgeAfter !== 'number' || row.purgeAfter <= now)
    ) {
      throw new ConvexError({ code: 'UNDO_WINDOW_EXPIRED' });
    }
  }
}

/**
 * Resolves only the requested identities through their exact compound indexes.
 * Removal and restore stay available even when a system exceeds the
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
    readTouchingConnections(ctx, mapId, systemId),
  ]);
  return {
    signatures: signatures.filter((row) => row !== null),
    connections,
    activities: activities.filter((row) => row !== null),
  };
}

/** Tombstones or restores the named identities after the system is confirmed live. */
export async function changeSignatureSelection(
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
  if (mode === 'restore') requireUndoWindow(state, systemId, ids, now);
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
