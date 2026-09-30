import { v } from 'convex/values';
import { MAP_CHAIN_UNDO_WINDOW_MS, isTombstoned } from '@/data/maps/chain-contract';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { errorCode } from './lib/errorCode';
import {
  queryMapSignatureActivity,
  queryMapSignatures,
  takeExpiredByPurgeAfter,
} from './lib/indexedQuery';
import { settleRemovedConnection } from './mapAuthoringCollapse';
import { CEILING_SWEEP_ACTOR } from './mapAuthoringSweep';
import { readTrackedPilotSystemIds } from './mapTrackingLive';

export const CHAIN_PURGE_BATCH = 128;
/** Signature and activity rows one pass may delete along with purged systems. */
const SYSTEM_CHILD_PURGE_BUDGET = 512;
/** Removed connections one pass may settle; each settle reads its map. */
const CONNECTION_SETTLE_BATCH = 16;

interface ChainPurgeResult {
  readonly deletedSystems: number;
  readonly deletedSystemChildren: number;
  readonly deletedConnections: number;
  readonly removedBranches: number;
  readonly heldConnections: number;
  readonly deletedEvents: number;
  readonly hasMore: boolean;
}

async function endpointIsLive(
  ctx: MutationCtx,
  cache: Map<string, boolean>,
  mapId: string,
  systemId: number | null,
): Promise<boolean> {
  if (systemId === null) return false;
  const key = `${mapId}:${systemId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const endpoint = await ctx.db
    .query('mapSystems')
    .withIndex('by_map_system', (q) =>
      q.eq('mapId', mapId).eq('systemId', systemId),
    )
    .unique();
  const live = endpoint !== null && !isTombstoned(endpoint);
  cache.set(key, live);
  return live;
}

/**
 * Signatures and their activity are keyed by solar system, so a purged
 * system's children would come back if the system were re-added. Deletes them
 * within the budget; `done` is false while some remain.
 */
async function deleteSystemChildren(
  ctx: MutationCtx,
  system: Pick<Doc<'mapSystems'>, 'mapId' | 'systemId'>,
  budget: number,
): Promise<{ deleted: number; done: boolean }> {
  const signatures = await queryMapSignatures(ctx, system.mapId, system.systemId).take(budget + 1);
  const doomedSignatures = signatures.slice(0, budget);
  for (const signature of doomedSignatures) await ctx.db.delete(signature._id);
  if (signatures.length > budget) return { deleted: doomedSignatures.length, done: false };

  const room = budget - doomedSignatures.length;
  const activity = await queryMapSignatureActivity(ctx, system.mapId, system.systemId).take(room + 1);
  const doomedActivity = activity.slice(0, room);
  for (const row of doomedActivity) await ctx.db.delete(row._id);
  return {
    deleted: doomedSignatures.length + doomedActivity.length,
    done: activity.length <= room,
  };
}

async function purgeExpiredSystems(
  ctx: MutationCtx,
  now: number,
): Promise<{ deletedSystems: number; deletedSystemChildren: number; hasMore: boolean }> {
  const expired = await takeExpiredByPurgeAfter(ctx, 'mapSystems', now, CHAIN_PURGE_BATCH + 1);
  let budget = SYSTEM_CHILD_PURGE_BUDGET;
  let deletedSystems = 0;
  let deletedSystemChildren = 0;
  for (const system of expired.slice(0, CHAIN_PURGE_BATCH)) {
    const children = await deleteSystemChildren(ctx, system, budget);
    budget -= children.deleted;
    deletedSystemChildren += children.deleted;
    // A system goes only once its children are gone, so a continuation resumes it.
    if (!children.done) return { deletedSystems, deletedSystemChildren, hasMore: true };
    await ctx.db.delete(system._id);
    deletedSystems += 1;
  }
  return { deletedSystems, deletedSystemChildren, hasMore: expired.length > CHAIN_PURGE_BATCH };
}

interface SettleState {
  readonly liveness: Map<string, boolean>;
  readonly tracked: Map<string, ReadonlySet<number>>;
}

async function trackedFor(
  ctx: MutationCtx,
  state: SettleState,
  mapId: string,
): Promise<ReadonlySet<number>> {
  const cached = state.tracked.get(mapId);
  if (cached !== undefined) return cached;
  const tracked = await readTrackedPilotSystemIds(ctx, mapId);
  state.tracked.set(mapId, tracked);
  return tracked;
}

type ConnectionFate = 'deleted' | 'branch_removed' | 'held' | 'deferred';

async function settleExpiredConnection(
  ctx: MutationCtx,
  connection: Doc<'mapConnections'>,
  state: SettleState,
  now: number,
): Promise<Exclude<ConnectionFate, 'deferred'>> {
  const { toSystemId, tombstone } = connection;
  if (tombstone.kind !== 'removed' || toSystemId === null) {
    await ctx.db.delete(connection._id);
    return 'deleted';
  }
  try {
    const outcome = await settleRemovedConnection(
      ctx,
      { ...connection, toSystemId },
      await trackedFor(ctx, state, connection.mapId),
      CEILING_SWEEP_ACTOR,
    );
    if (outcome === 'held') {
      // Check again tomorrow; until then it shows as a restorable removed connection.
      await ctx.db.patch(connection._id, {
        tombstone: { ...tombstone, purgeAfter: now + MAP_CHAIN_UNDO_WINDOW_MS },
      });
      return 'held';
    }
    if (outcome === 'branch_removed') {
      state.liveness.clear();
      return 'branch_removed';
    }
  } catch (error) {
    console.error(JSON.stringify({
      scope: 'map:chain-purge',
      outcome: 'settle-failed',
      mapId: connection.mapId,
      connectionId: connection._id,
      error: errorCode(error),
    }));
  }
  await ctx.db.delete(connection._id);
  return 'deleted';
}

/**
 * Removed connections whose undo window has ended. One with a missing or
 * removed endpoint is deleted; one between two systems still on the map is
 * settled, so no removed connection outlives its reason to exist.
 */
async function purgeExpiredConnections(
  ctx: MutationCtx,
  now: number,
): Promise<{
  deletedConnections: number;
  removedBranches: number;
  heldConnections: number;
  hasMore: boolean;
}> {
  const expired = await takeExpiredByPurgeAfter(ctx, 'mapConnections', now, CHAIN_PURGE_BATCH + 1);
  const state: SettleState = { liveness: new Map(), tracked: new Map() };
  const fates: Record<ConnectionFate, number> = { deleted: 0, branch_removed: 0, held: 0, deferred: 0 };
  let settled = 0;
  for (const candidate of expired.slice(0, CHAIN_PURGE_BATCH)) {
    // An earlier settlement can give a sibling connection a fresh undo window.
    const connection = await ctx.db.get(candidate._id);
    if (
      connection === null
      || connection.tombstone.kind !== 'removed'
      || connection.tombstone.purgeAfter === null
      || connection.tombstone.purgeAfter > now
    ) continue;
    const bothEndpointsLive =
      await endpointIsLive(ctx, state.liveness, connection.mapId, connection.fromSystemId)
      && await endpointIsLive(ctx, state.liveness, connection.mapId, connection.toSystemId);
    if (!bothEndpointsLive) {
      await ctx.db.delete(connection._id);
      fates.deleted += 1;
    } else if (settled >= CONNECTION_SETTLE_BATCH) {
      fates.deferred += 1;
    } else {
      settled += 1;
      fates[await settleExpiredConnection(ctx, connection, state, now)] += 1;
    }
  }
  return {
    deletedConnections: fates.deleted,
    removedBranches: fates.branch_removed,
    heldConnections: fates.held,
    hasMore: fates.deferred > 0 || expired.length > CHAIN_PURGE_BATCH,
  };
}

async function purgeExpiredEvents(
  ctx: MutationCtx,
  now: number,
): Promise<{ deletedEvents: number; hasMore: boolean }> {
  const expired = await ctx.db
    .query('mapEvents')
    .withIndex('by_purge_after', (q) => q.lte('purgeAfter', now))
    .take(CHAIN_PURGE_BATCH + 1);
  const doomed = expired.slice(0, CHAIN_PURGE_BATCH);
  for (const event of doomed) {
    await ctx.db.delete(event._id);
  }
  return { deletedEvents: doomed.length, hasMore: expired.length > CHAIN_PURGE_BATCH };
}

async function purgeExpiredChainTombstonesAt(
  ctx: MutationCtx,
  now: number,
): Promise<ChainPurgeResult> {
  const systems = await purgeExpiredSystems(ctx, now);
  const connections = await purgeExpiredConnections(ctx, now);
  const events = await purgeExpiredEvents(ctx, now);
  return {
    deletedSystems: systems.deletedSystems,
    deletedSystemChildren: systems.deletedSystemChildren,
    deletedConnections: connections.deletedConnections,
    removedBranches: connections.removedBranches,
    heldConnections: connections.heldConnections,
    deletedEvents: events.deletedEvents,
    hasMore: systems.hasMore || connections.hasMore || events.hasMore,
  };
}

function madeProgress(result: ChainPurgeResult): boolean {
  return result.deletedSystems
    + result.deletedSystemChildren
    + result.deletedConnections
    + result.removedBranches
    + result.heldConnections
    + result.deletedEvents > 0;
}

/** Daily cron. A full pass continues immediately while it makes progress. */
export const purgeExpiredChainTombstones = internalMutation({
  args: {},
  handler: async (ctx) => {
    const result = await purgeExpiredChainTombstonesAt(ctx, Date.now());
    if (result.hasMore && madeProgress(result)) {
      await ctx.scheduler.runAfter(0, internal.mapChainCleanup.purgeExpiredChainTombstones, {});
    }
    return result;
  },
});

const CHAIN_RETENTION_BACKFILL_BATCH = 128;

const backfillPhaseValidator = v.union(
  v.literal('kept-connections'),
  v.literal('mapSignatures'),
  v.literal('mapSignatureActivity'),
);

type BackfillPhase = 'kept-connections' | 'mapSignatures' | 'mapSignatureActivity';

const NEXT_PHASE: Record<BackfillPhase, BackfillPhase | null> = {
  'kept-connections': 'mapSignatures',
  mapSignatures: 'mapSignatureActivity',
  mapSignatureActivity: null,
};

/** Removed connections kept forever before settling existed get an expiry, so the purge settles them. */
async function expireKeptConnections(ctx: MutationCtx, now: number): Promise<{ changed: number; done: boolean }> {
  const kept = await ctx.db
    .query('mapConnections')
    .withIndex('by_purge_after', (q) => q.eq('tombstone.purgeAfter', null))
    .take(CHAIN_RETENTION_BACKFILL_BATCH);
  for (const connection of kept) {
    if (connection.tombstone.kind !== 'removed') continue;
    await ctx.db.patch(connection._id, { tombstone: { ...connection.tombstone, purgeAfter: now } });
  }
  return { changed: kept.length, done: kept.length < CHAIN_RETENTION_BACKFILL_BATCH };
}

/** Signature and activity rows left behind by systems purged before their children were. */
async function deleteOrphanedChildren(
  ctx: MutationCtx,
  table: 'mapSignatures' | 'mapSignatureActivity',
  cursor: string | null,
): Promise<{ changed: number; done: boolean; cursor: string }> {
  const page = await ctx.db
    .query(table)
    .paginate({ cursor, numItems: CHAIN_RETENTION_BACKFILL_BATCH });
  const systemExists = new Map<string, boolean>();
  let changed = 0;
  for (const row of page.page) {
    const key = `${row.mapId}:${row.systemId}`;
    let exists = systemExists.get(key);
    if (exists === undefined) {
      const system = await ctx.db
        .query('mapSystems')
        .withIndex('by_map_system', (q) => q.eq('mapId', row.mapId).eq('systemId', row.systemId))
        .unique();
      exists = system !== null;
      systemExists.set(key, exists);
    }
    if (!exists) {
      await ctx.db.delete(row._id);
      changed += 1;
    }
  }
  return { changed, done: page.isDone, cursor: page.continueCursor };
}

/**
 * One-off, run once after deploy: gives connections kept forever by the old
 * purge an expiry so the daily purge settles them, then deletes signature and
 * activity rows whose system is already gone. Each page schedules the next.
 */
export const backfillChainRetention = internalMutation({
  args: {
    phase: v.optional(backfillPhaseValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ phase: backfillPhaseValidator, changed: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const phase = args.phase ?? 'kept-connections';
    const step = phase === 'kept-connections'
      ? { ...(await expireKeptConnections(ctx, Date.now())), cursor: null }
      : await deleteOrphanedChildren(ctx, phase, args.cursor ?? null);
    const next = step.done ? NEXT_PHASE[phase] : phase;
    if (next !== null) {
      await ctx.scheduler.runAfter(0, internal.mapChainCleanup.backfillChainRetention, {
        phase: next,
        cursor: step.done ? null : step.cursor,
      });
    }
    return { phase, changed: step.changed, done: step.done && next === null };
  },
});
