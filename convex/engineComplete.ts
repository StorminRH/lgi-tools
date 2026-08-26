// Exactly-once run epilogue and the per-subject chain hop it may schedule.
import { v } from 'convex/values';
import {
  computeChainBoundary,
  computeNextDueAt,
  isColdFromPresence,
  isRegisteredDataset,
  isRunningFresh,
  SYNC_DATASET_CONFIG,
} from '@/lib/sync-engine';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { dispatch, syncDatasetValidator } from './lib/engineCore';
import { getPresence, getSyncSubject } from './lib/subjects';

export const chainDispatch = internalMutation({
  args: {
    dataset: syncDatasetValidator,
    userId: v.string(),
  },
  handler: async (ctx, { dataset, userId }) => {
    if (!isRegisteredDataset(dataset)) return;
    const subject = await getSyncSubject(ctx.db, dataset, userId);
    if (subject === null) return;
    const now = Date.now();
    if (isRunningFresh(subject.status, subject.lastRequestedAt, now)) return;
    if (subject.nextDueAt === null || subject.nextDueAt > now) return;
    const presence = await getPresence(ctx.db, dataset, userId);
    if (isColdFromPresence(presence, SYNC_DATASET_CONFIG[dataset].coldAfterMs, now)) return;
    await dispatch(ctx, subject, now);
  },
});

async function resolveCompletionSchedule(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
  failed: boolean,
  cadenceFloorMs: number,
  coldAfterMs: number,
  chainOnSuccess: boolean,
  now: number,
): Promise<{ nextDueAt: number | null; chainAt: number | null }> {
  if (failed) {
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    if (!isColdFromPresence(presence, coldAfterMs, now)) {
      const boundary = now + cadenceFloorMs;
      return { nextDueAt: boundary, chainAt: boundary };
    }
    return { nextDueAt: computeNextDueAt(null, cadenceFloorMs, now), chainAt: null };
  }
  if (subject.syncedCharacterIds.length === 0) {
    return { nextDueAt: null, chainAt: null };
  }
  const yielded =
    subject.lastError === null && (subject.coveredCharacterIds?.length ?? 0) > 0;
  if (chainOnSuccess && yielded && subject.minExpiresAt !== null) {
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    if (!isColdFromPresence(presence, coldAfterMs, now)) {
      const boundary = computeChainBoundary(subject.minExpiresAt, cadenceFloorMs, now);
      return { nextDueAt: boundary, chainAt: boundary };
    }
  }
  return {
    nextDueAt: computeNextDueAt(subject.minExpiresAt, cadenceFloorMs, now),
    chainAt: null,
  };
}

export const onSyncComplete = internalMutation({
  args: {
    workId: v.string(),
    context: v.object({ dataset: syncDatasetValidator, userId: v.string() }),
    result: v.union(
      v.object({ kind: v.literal('success') }),
      v.object({ kind: v.literal('failed'), error: v.string() }),
    ),
  },
  handler: async (ctx, { workId, context, result }) => {
    if (!isRegisteredDataset(context.dataset)) return;
    const subject = await getSyncSubject(ctx.db, context.dataset, context.userId);
    if (subject === null || subject.workId !== workId) return;
    const now = Date.now();
    const { cadenceFloorMs, coldAfterMs, chainOnSuccess } = SYNC_DATASET_CONFIG[context.dataset];
    const failed = result.kind === 'failed';
    if (failed) {
      console.error(
        JSON.stringify({
          scope: 'engine:sync',
          dataset: subject.dataset,
          outcome: 'failed',
          error: result.error.slice(0, 500),
        }),
      );
    }

    const { nextDueAt, chainAt } = await resolveCompletionSchedule(
      ctx,
      subject,
      failed,
      cadenceFloorMs,
      coldAfterMs,
      chainOnSuccess === true,
      now,
    );

    await ctx.db.patch(subject._id, {
      status: 'idle',
      workId: null,
      nextDueAt,
      ...(failed
        ? { lastError: `sync_failed: ${result.error.slice(0, 500)}`, minExpiresAt: null }
        : {}),
    });

    if (chainAt !== null) {
      await ctx.scheduler.runAt(chainAt, internal.engineComplete.chainDispatch, {
        dataset: subject.dataset,
        userId: subject.userId,
      });
    }
  },
});
