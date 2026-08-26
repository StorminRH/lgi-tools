// Public presence door for the sync engine. Interval beats stop at the
// presence write; mount/visible (and a recovery interval after a cold gap)
// dispatch when stale. Registration and dispatch live in lib/engineCore.
import { v } from 'convex/values';
import {
  computeNextDueAt,
  hasSyncTarget,
  isCold,
  isRegisteredDataset,
  isRunningFresh,
  isStaleForImmediate,
  SYNC_DATASET_CONFIG,
  type SyncDataset,
} from '@/lib/sync-engine';
import { mutation, type MutationCtx } from './_generated/server';
import { dispatch, syncDatasetValidator } from './lib/engineCore';
import { getPresence, getSyncSubject, newIdleSubject } from './lib/subjects';

export const heartbeat = mutation({
  args: {
    dataset: syncDatasetValidator,
    characterIdsHint: v.array(v.number()),
    reason: v.union(v.literal('mount'), v.literal('visible'), v.literal('interval')),
    visible: v.optional(v.boolean()),
    tabId: v.optional(v.string()),
  },
  handler: async (ctx, { dataset, characterIdsHint, reason, visible, tabId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return;
    if (!isRegisteredDataset(dataset)) return;
    const userId = identity.subject;
    const now = Date.now();
    const presence = await getPresence(ctx.db, dataset, userId);
    if (presence !== null && isLeftTab(presence.leftTabId, tabId)) return;

    const wasCold = await upsertPresence(
      ctx,
      dataset,
      userId,
      visible !== false,
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
  dataset: SyncDataset,
  userId: string,
  seenVisible: boolean,
  now: number,
  tabId: string | undefined,
): Promise<boolean> {
  const presence = await getPresence(ctx.db, dataset, userId);
  const wasCold =
    presence !== null && isCold(presence, SYNC_DATASET_CONFIG[dataset].coldAfterMs, now);
  const tabFields = tabId === undefined ? {} : { tabId, leftTabId: '' };
  if (presence === null) {
    await ctx.db.insert('syncPresence', {
      dataset,
      userId,
      lastSeenAt: now,
      lastVisibleAt: now,
      ...tabFields,
    });
  } else {
    await ctx.db.patch(presence._id, {
      lastSeenAt: now,
      ...(seenVisible ? { lastVisibleAt: now } : {}),
      ...tabFields,
    });
  }
  return wasCold;
}

function isLeftTab(leftTabId: string | undefined, tabId: string | undefined): boolean {
  return leftTabId !== undefined && leftTabId !== '' && (tabId === undefined || tabId === leftTabId);
}
