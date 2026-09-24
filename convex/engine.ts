import { v } from 'convex/values';
import {
  computeNextDueAt,
  hasSyncTarget,
  isCold,
  isRunningFresh,
  isStaleForImmediate,
  SYNC_DATASET_CONFIG,
  type SyncDataset,
} from '@/lib/sync-engine';
import type { Doc } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';
import { dispatch, syncDatasetValidator } from './lib/engineCore';
import { getPresence, getSyncSubject, newIdleSubject } from './lib/subjects';

export const currentUser = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
});

export const heartbeat = mutation({
  args: {
    dataset: syncDatasetValidator,
    characterIdsHint: v.array(v.number()),
    reason: v.union(v.literal('mount'), v.literal('visible'), v.literal('interval')),
    visible: v.boolean(),
    tabId: v.string(),
    expectedUserId: v.string(),
  },
  handler: async (ctx, { dataset, characterIdsHint, reason, visible, tabId, expectedUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    if (expectedUserId !== identity.subject) return;
    const userId = identity.subject;
    const now = Date.now();
    const presence = await getPresence(ctx.db, dataset, userId);
    if (presence !== null && isLeftTab(presence.leftTabId, tabId)) return;

    if (reason === 'interval' && isPresenceFresh(presence, dataset, visible, tabId, now)) {
      return;
    }

    const wasCold = await upsertPresence(
      ctx,
      presence,
      dataset,
      userId,
      visible,
      now,
      tabId,
    );

    if (reason === 'interval' && !wasCold) return;

    let subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject === null) {
      const id = await ctx.db.insert('syncSubjects', newIdleSubject(dataset, userId));
      subject = await ctx.db.get(id);
      if (subject === null) return;
    }

    if (!hasSyncTarget(subject.syncedCharacterIds, characterIdsHint)) return;
    if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) return;
    if (!isStaleForImmediate(subject.minExpiresAt, subject.syncedCharacterIds, characterIdsHint, now)) {
      if (subject.nextDueAt === null) {
        const { cadenceFloorMs } = SYNC_DATASET_CONFIG[dataset];
        await ctx.db.patch(subject._id, {
          nextDueAt: computeNextDueAt(
            subject.minExpiresAt,
            cadenceFloorMs,
            subject.lastFinishedAt ?? now,
          ),
        });
      }
      return;
    }
    await dispatch(ctx, subject, now);
  },
});

async function upsertPresence(
  ctx: MutationCtx,
  presence: Doc<'syncPresence'> | null,
  dataset: SyncDataset,
  userId: string,
  visible: boolean,
  now: number,
  tabId: string,
): Promise<boolean> {
  const wasCold =
    presence !== null && isCold(presence, SYNC_DATASET_CONFIG[dataset].coldAfterMs, now);
  if (presence === null) {
    await ctx.db.insert('syncPresence', {
      dataset,
      userId,
      lastSeenAt: now,
      lastVisibleAt: now,
      tabId,
      leftTabId: '',
    });
  } else {
    await ctx.db.patch(presence._id, {
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
 */
const PRESENCE_REFRESH_MS = 60_000;

function isPresenceFresh(
  presence: Doc<'syncPresence'> | null,
  dataset: SyncDataset,
  visible: boolean,
  tabId: string,
  now: number,
): boolean {
  if (presence === null) return false;
  if (isCold(presence, SYNC_DATASET_CONFIG[dataset].coldAfterMs, now)) return false;
  if (presence.tabId !== tabId || (presence.leftTabId ?? '') !== '') return false;
  if (now - presence.lastSeenAt >= PRESENCE_REFRESH_MS) return false;
  return !visible || now - (presence.lastVisibleAt ?? 0) < PRESENCE_REFRESH_MS;
}

function isLeftTab(leftTabId: string | undefined, tabId: string): boolean {
  return leftTabId !== undefined && leftTabId !== '' && tabId === leftTabId;
}
