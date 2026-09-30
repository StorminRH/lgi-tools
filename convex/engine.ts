import { v } from 'convex/values';
import {
  computeNextDueAt,
  hasSyncTarget,
  isCold,
  isStaleForImmediate,
  LOCATION_CADENCE_FLOOR_MS,
  LOCATION_COLD_AFTER_MS,
  HIDDEN_PRESENCE_MAX_MS,
} from '@/lib/sync-engine';
import type { Doc } from './_generated/dataModel';
import { mutation, query, internalMutation, type MutationCtx } from './_generated/server';
import {
  ensureLocationSync,
  getLocationSync,
  type LocationSyncState,
  runState,
  scheduleRun,
  stopSync,
} from './lib/locationSchedule';
import { internal } from './_generated/api';
import { clearCoverageForUser } from './lib/locationCoverage';
import { getPresence } from './lib/subjects';

export const currentUser = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
});

export const heartbeat = mutation({
  args: {
    dataset: v.literal('characterLocation'),
    characterIdsHint: v.array(v.number()),
    reason: v.union(v.literal('mount'), v.literal('visible'), v.literal('interval')),
    visible: v.boolean(),
    tabId: v.string(),
    expectedUserId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { characterIdsHint, reason, visible, tabId, expectedUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    if (expectedUserId !== identity.subject) return;
    const userId = identity.subject;
    const now = Date.now();
    const presence = await getPresence(ctx.db, 'characterLocation', userId);
    if (presence !== null && isLeftTab(presence.leftTabId, tabId)) return;

    if (reason === 'interval' && isPresenceFresh(presence, visible, tabId, now)) {
      return;
    }

    const wasCold = await upsertPresence(ctx, presence, userId, visible, now, tabId);
    if (staysColdAfterBeat(presence, visible, now)) return;
    await ensurePresenceExpiry(ctx, userId);
    await scheduleFromBeat(ctx, userId, characterIdsHint, reason === 'interval' && !wasCold, now);
  },
});

/**
 * A tab hidden past the visible cap stays cold even after this beat, so it
 * must not revive a run that finishSync would immediately stop again.
 */
function staysColdAfterBeat(
  presence: Doc<'syncPresence'> | null,
  visible: boolean,
  now: number,
): boolean {
  const afterBeat = {
    lastSeenAt: now,
    lastVisibleAt: visible ? now : presence?.lastVisibleAt,
  };
  return isCold(afterBeat, LOCATION_COLD_AFTER_MS, now);
}

/**
 * A warm interval beat (safetyNetOnly) only re-arms a user whose run died or
 * was never scheduled, and never moves a pending run. Mount, visible, and
 * post-cold beats may also pull a pending run forward when the cache is stale.
 */
async function scheduleFromBeat(
  ctx: MutationCtx,
  userId: string,
  characterIdsHint: number[],
  safetyNetOnly: boolean,
  now: number,
): Promise<void> {
  const state = await ensureLocationSync(ctx, userId);
  if (!hasSyncTarget(state.syncedCharacterIds, characterIdsHint)) return;
  const run = await runState(ctx.db, state);
  if (run === 'inProgress') return;
  const stale = isStaleForImmediate(
    state.minExpiresAt,
    state.syncedCharacterIds,
    characterIdsHint,
    now,
  );
  if (run === 'pending' && (safetyNetOnly || !stale)) return;
  await ctx.db.patch(
    'locationSync',
    state._id,
    await scheduleRun(ctx, state, beatDueAt(state, stale, now), now),
  );
}

/**
 * The client decides staleness through its hint, so the floor after the last
 * run is enforced here: a beat can pull a run forward, never faster.
 */
function beatDueAt(state: LocationSyncState, stale: boolean, now: number): number {
  const floorAt = (state.lastRunAt ?? 0) + LOCATION_CADENCE_FLOOR_MS;
  const cacheDueAt = stale
    ? now
    : computeNextDueAt(state.minExpiresAt, LOCATION_CADENCE_FLOOR_MS, state.lastFinishedAt ?? now);
  return Math.max(floorAt, cacheDueAt);
}

async function upsertPresence(
  ctx: MutationCtx,
  presence: Doc<'syncPresence'> | null,
  userId: string,
  visible: boolean,
  now: number,
  tabId: string,
): Promise<boolean> {
  const wasCold = presence !== null && isCold(presence, LOCATION_COLD_AFTER_MS, now);
  if (presence === null) {
    await ctx.db.insert('syncPresence', {
      dataset: 'characterLocation',
      userId,
      lastSeenAt: now,
      lastVisibleAt: now,
      tabId,
      leftTabId: '',
    });
  } else {
    await ctx.db.patch('syncPresence', presence._id, {
      lastSeenAt: now,
      ...(visible ? { lastVisibleAt: now } : {}),
      tabId,
      leftTabId: '',
    });
  }
  return wasCold;
}

/**
 * An interval beat inside this window of the last presence write changes no
 * liveness decision (cold is minutes away), so it skips the write entirely.
 * It sits below HEARTBEAT_MS so timer jitter cannot skip every other beat.
 */
const PRESENCE_REFRESH_MS = 45_000;

function isPresenceFresh(
  presence: Doc<'syncPresence'> | null,
  visible: boolean,
  tabId: string,
  now: number,
): boolean {
  if (presence === null) return false;
  if (isCold(presence, LOCATION_COLD_AFTER_MS, now)) return false;
  if (presence.tabId !== tabId || (presence.leftTabId ?? '') !== '') return false;
  if (now - presence.lastSeenAt >= PRESENCE_REFRESH_MS) return false;
  return !visible || now - (presence.lastVisibleAt ?? 0) < PRESENCE_REFRESH_MS;
}

function isLeftTab(leftTabId: string | undefined, tabId: string): boolean {
  return leftTabId !== undefined && leftTabId !== '' && tabId === leftTabId;
}

/** One liveness check per cold window, independent of external action completion. */
export async function ensurePresenceExpiry(ctx: MutationCtx, userId: string): Promise<void> {
  const presence = await getPresence(ctx.db, 'characterLocation', userId);
  if (presence === null) return;
  // A check that already ran, failed, or was cancelled no longer guards this
  // presence, so only a live one short-circuits.
  if (presence.expiryJobId !== undefined) {
    const job = await ctx.db.system.get('_scheduled_functions', presence.expiryJobId);
    if (job !== null && (job.state.kind === 'pending' || job.state.kind === 'inProgress')) return;
  }
  await schedulePresenceExpiry(ctx, presence);
}

async function schedulePresenceExpiry(ctx: MutationCtx, presence: Doc<'syncPresence'>): Promise<void> {
  const at = Math.min(
    presence.lastSeenAt + LOCATION_COLD_AFTER_MS,
    (presence.lastVisibleAt ?? presence.lastSeenAt) + HIDDEN_PRESENCE_MAX_MS,
  ) + 1;
  const expiryJobId = await ctx.scheduler.runAt(at, internal.engine.expirePresence, {
    presenceId: presence._id,
  });
  await ctx.db.patch('syncPresence', presence._id, { expiryJobId });
}

export const expirePresence = internalMutation({
  args: { presenceId: v.id('syncPresence') },
  returns: v.null(),
  handler: async (ctx, { presenceId }) => {
    const presence = await ctx.db.get('syncPresence', presenceId);
    if (presence === null) return null;
    const now = Date.now();
    if (!isCold(presence, LOCATION_COLD_AFTER_MS, now)) {
      await schedulePresenceExpiry(ctx, presence);
      return null;
    }
    const state = await getLocationSync(ctx.db, presence.userId);
    if (state !== null) await stopSync(ctx, state, now);
    else await clearCoverageForUser(ctx, presence.userId);
    await ctx.db.patch('syncPresence', presenceId, { expiryJobId: undefined });
    return null;
  },
});
