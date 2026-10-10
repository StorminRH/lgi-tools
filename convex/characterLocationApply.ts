import { type Infer, v } from 'convex/values';
import {
  computeChainBoundary,
  computeNextDueAt,
  isColdFromPresence,
  LOCATION_CADENCE_FLOOR_MS,
  LOCATION_COLD_AFTER_MS,
  minCacheWindow,
} from '@/lib/sync-engine';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { clearAccessLeases, leaseWriteValidator, writeAccessLeases } from './characterLocationAccess';
import { characterSyncResultFields } from './lib/characterSync';
import { dropUnsyncedCharacterCaches } from './lib/locationCaches';
import { applyCoverageSet, clearCoverageForUser } from './lib/locationCoverage';
import {
  getLocationSync,
  type LocationSyncState,
  scheduleRun,
} from './lib/locationSchedule';
import { getPresence } from './lib/subjects';

export const JUMP_CONTINUITY_MS = 45_000;

const characterResultValidator = v.object({
  ...characterSyncResultFields,
  solarSystemId: v.union(v.number(), v.null()),
  stationId: v.union(v.number(), v.null()),
  structureId: v.union(v.number(), v.null()),
  shipTypeId: v.union(v.number(), v.null()),
  systemChanged: v.boolean(),
  etagLocation: v.union(v.string(), v.null()),
  etagShip: v.union(v.string(), v.null()),
  online: v.union(v.boolean(), v.null()),
  etagOnline: v.union(v.string(), v.null()),
  onlineExpiresAt: v.union(v.number(), v.null()),
});

export type CharacterResult = Infer<typeof characterResultValidator>;

export const syncOutcomeValidator = v.union(
  v.object({
    kind: v.literal('success'),
    trackedCharacterIds: v.array(v.number()),
    results: v.array(characterResultValidator),
    runError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
  }),
  v.object({ kind: v.literal('failed'), error: v.string() }),
);

type SyncOutcome = Infer<typeof syncOutcomeValidator>;

type Freshness = Pick<LocationSyncState, 'lastFinishedAt' | 'coveredCharacterIds' | 'syncedCharacterIds'>;

/**
 * The one write a location run makes when it ends, success or failure. It
 * applies the ESI results, persists vended leases, stamps the sync state, and
 * schedules the next run — or stops when the watcher has gone cold. A result
 * whose generation no longer owns the state is dropped whole.
 */
export const finishSync = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    outcome: syncOutcomeValidator,
    leases: v.array(leaseWriteValidator),
    clearedLeaseCharacterIds: v.array(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getLocationSync(ctx.db, args.userId);
    if (state === null || state.runId !== args.generation) return null;
    const now = Date.now();

    await writeAccessLeases(ctx, args.userId, args.leases, now);
    await clearAccessLeases(ctx, args.userId, args.clearedLeaseCharacterIds);

    const stamp = {
      ...(args.outcome.kind === 'success'
        ? await applySuccess(ctx, args.userId, args.outcome, state, now)
        : recordFailure(args.outcome.error)),
      lastRunAt: now,
    };
    const next = { ...state, ...stamp };

    const presence = await getPresence(ctx.db, 'characterLocation', args.userId);
    const cold = isColdFromPresence(presence, LOCATION_COLD_AFTER_MS, now);
    const at = cold ? null : nextRunAt(args.outcome, next, now);
    if (at === null) {
      await ctx.db.patch('locationSync', state._id, { ...stamp, jobId: null });
      if (cold) await clearCoverageForUser(ctx, args.userId);
      return null;
    }
    const scheduled = await scheduleRun(ctx, state, at, now, { replacePending: false });
    await ctx.db.patch('locationSync', state._id, { ...stamp, ...scheduled });
    return null;
  },
});

async function applySuccess(
  ctx: MutationCtx,
  userId: string,
  outcome: Extract<SyncOutcome, { kind: 'success' }>,
  state: Freshness,
  now: number,
): Promise<Partial<LocationSyncState>> {
  const { windows, coveredCharacterIds } = await applyCharacterResults(
    ctx,
    userId,
    outcome,
    state,
    now,
  );
  await applyCoverageSet(ctx, userId, outcome.trackedCharacterIds, coveredCharacterIds);
  await dropUnsyncedCharacterCaches(ctx, userId, state.syncedCharacterIds, outcome.trackedCharacterIds);
  if (outcome.runError !== null) {
    console.warn(
      JSON.stringify({
        scope: 'location:sync',
        outcome: 'partial',
        error: outcome.runError.slice(0, 500),
        rlGroup: outcome.rlGroup,
        rlRemaining: outcome.rlRemaining,
      }),
    );
  }
  return {
    minExpiresAt: minCacheWindow(windows),
    syncedCharacterIds: outcome.trackedCharacterIds,
    coveredCharacterIds,
    lastFinishedAt: now,
  };
}

function recordFailure(error: string): Partial<LocationSyncState> {
  console.error(
    JSON.stringify({ scope: 'location:sync', outcome: 'failed', error: error.slice(0, 500) }),
  );
  return { minExpiresAt: null };
}

/**
 * A failure retries at the floor. A run that read at least one online pilot
 * cleanly chains exactly at the cache boundary; anything else (all pilots
 * offline, a run-level error) re-arms with jitter so idle probes spread out.
 */
function nextRunAt(
  outcome: SyncOutcome,
  next: LocationSyncState,
  now: number,
): number | null {
  if (outcome.kind === 'failed') return now + LOCATION_CADENCE_FLOOR_MS;
  if (next.syncedCharacterIds.length === 0) return null;
  const yielded = outcome.runError === null && next.coveredCharacterIds.length > 0;
  return yielded
    ? computeChainBoundary(next.minExpiresAt, LOCATION_CADENCE_FLOOR_MS, now)
    : computeNextDueAt(next.minExpiresAt, LOCATION_CADENCE_FLOOR_MS, now);
}

async function applyCharacterResults(
  ctx: MutationCtx,
  userId: string,
  args: { trackedCharacterIds: number[]; results: CharacterResult[] },
  freshness: Freshness,
  now: number,
): Promise<{ windows: Array<number | null>; coveredCharacterIds: number[] }> {
  const enumerated = new Set(args.trackedCharacterIds);
  const windowsByCharacter = new Map<number, number | null>();
  const coveredCharacterIds: number[] = [];
  for (const result of args.results) {
    if (!enumerated.has(result.characterId)) continue;
    if (result.error === null && result.online === true) {
      coveredCharacterIds.push(result.characterId);
    }
    // A held probe and a 304 location need no read of their stored documents.
    if (result.online !== null && result.onlineExpiresAt !== null) {
      const probe = await ctx.db.query('characterLocationOnline')
        .withIndex('by_user_character', (q) => q.eq('userId', userId).eq('characterId', result.characterId))
        .unique();
      await applyOnlineProbeResult(ctx, userId, result, probe ?? undefined);
    }
    const location = result.error === null && result.solarSystemId !== null
      ? await ctx.db.query('characterLocation')
        .withIndex('by_user_character', (q) => q.eq('userId', userId).eq('characterId', result.characterId))
        .unique()
      : null;
    const window = await applyLocationResult(
      ctx,
      userId,
      result,
      location ?? undefined,
      freshness,
      now,
    );
    windowsByCharacter.set(result.characterId, window);
  }
  return { windows: [...windowsByCharacter.values()], coveredCharacterIds };
}

async function applyOnlineProbeResult(
  ctx: MutationCtx,
  userId: string,
  result: CharacterResult,
  existing: Doc<'characterLocationOnline'> | undefined,
): Promise<void> {
  if (result.online === null || result.onlineExpiresAt === null) return;
  if (existing === undefined) {
    await ctx.db.insert('characterLocationOnline', {
      userId,
      characterId: result.characterId,
      online: result.online,
      etagOnline: result.etagOnline,
      onlineExpiresAt: result.onlineExpiresAt,
    });
    return;
  }
  if (
    existing.online !== result.online
    || existing.etagOnline !== result.etagOnline
    || existing.onlineExpiresAt !== result.onlineExpiresAt
  ) {
    await ctx.db.patch(existing._id, {
      online: result.online,
      etagOnline: result.etagOnline,
      onlineExpiresAt: result.onlineExpiresAt,
    });
  }
}

async function applyLocationResult(
  ctx: MutationCtx,
  userId: string,
  result: CharacterResult,
  existing: Doc<'characterLocation'> | undefined,
  freshness: Freshness,
  now: number,
): Promise<number | null> {
  if (result.error !== null) return null;
  if (result.solarSystemId === null) return result.expiresAt;

  const prevFresh = isPrevFresh(freshness, result.characterId, now);

  if (existing === undefined) {
    await ctx.db.insert('characterLocation', {
      userId,
      characterId: result.characterId,
      solarSystemId: result.solarSystemId,
      stationId: result.stationId,
      structureId: result.structureId,
      shipTypeId: result.shipTypeId,
      prevSolarSystemId: null,
      prevFresh: false,
      transitionObservedAt: now,
      observedAt: now,
      etagLocation: result.etagLocation,
      etagShip: result.etagShip,
    });
    return result.expiresAt;
  }

  if (result.systemChanged) {
    const shipTypeId = result.shipTypeId ?? existing.shipTypeId;
    const next = {
      solarSystemId: result.solarSystemId,
      stationId: result.stationId,
      structureId: result.structureId,
      shipTypeId,
      prevSolarSystemId: existing.solarSystemId,
      prevFresh,
      transitionObservedAt: now,
      observedAt: now,
      etagLocation: result.etagLocation,
      etagShip: result.etagShip,
    };
    await ctx.db.patch(existing._id, next);
    return result.expiresAt;
  }

  const next = {
    stationId: result.stationId,
    structureId: result.structureId,
    observedAt: now,
    etagLocation: result.etagLocation,
  };
  if (
    existing.stationId !== next.stationId
    || existing.structureId !== next.structureId
    || existing.etagLocation !== next.etagLocation
  ) {
    await ctx.db.patch(existing._id, next);
  }
  return result.expiresAt;
}

function isPrevFresh(
  freshness: Freshness,
  characterId: number,
  now: number,
): boolean {
  if (freshness.lastFinishedAt === null) return false;
  if (now - freshness.lastFinishedAt > JUMP_CONTINUITY_MS) return false;
  return freshness.coveredCharacterIds.includes(characterId);
}
