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

type CompletionSchedule = { nextDueAt: number | null; chainAt: number | null };

function freshFailureHop(cadenceFloorMs: number, now: number): CompletionSchedule {
  const boundary = now + cadenceFloorMs;
  return { nextDueAt: boundary, chainAt: boundary };
}

function coldFailureReArm(cadenceFloorMs: number, now: number): CompletionSchedule {
  return { nextDueAt: computeNextDueAt(null, cadenceFloorMs, now), chainAt: null };
}

function parkUntilTargets(): CompletionSchedule {
  return { nextDueAt: null, chainAt: null };
}

function chainHop(
  minExpiresAt: number,
  cadenceFloorMs: number,
  now: number,
): CompletionSchedule {
  const boundary = computeChainBoundary(minExpiresAt, cadenceFloorMs, now);
  return { nextDueAt: boundary, chainAt: boundary };
}

function jitteredScanReArm(
  minExpiresAt: number | null,
  cadenceFloorMs: number,
  now: number,
): CompletionSchedule {
  return { nextDueAt: computeNextDueAt(minExpiresAt, cadenceFloorMs, now), chainAt: null };
}

async function resolveCompletionSchedule(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
  failed: boolean,
  cadenceFloorMs: number,
  coldAfterMs: number,
  chainOnSuccess: boolean,
  now: number,
): Promise<CompletionSchedule> {
  if (failed) {
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    if (!isColdFromPresence(presence, coldAfterMs, now)) {
      return freshFailureHop(cadenceFloorMs, now);
    }
    return coldFailureReArm(cadenceFloorMs, now);
  }
  if (subject.syncedCharacterIds.length === 0) {
    return parkUntilTargets();
  }
  const yielded =
    subject.lastError === null && (subject.coveredCharacterIds?.length ?? 0) > 0;
  if (chainOnSuccess && yielded && subject.minExpiresAt !== null) {
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    if (!isColdFromPresence(presence, coldAfterMs, now)) {
      return chainHop(subject.minExpiresAt, cadenceFloorMs, now);
    }
  }
  return jitteredScanReArm(subject.minExpiresAt, cadenceFloorMs, now);
}

export const onSyncCompleteArgs = {
  workId: v.string(),
  context: v.object({ dataset: syncDatasetValidator, userId: v.string() }),
  result: v.union(
    v.object({ kind: v.literal('success') }),
    v.object({ kind: v.literal('failed'), error: v.string() }),
  ),
};

export async function completeSyncRun(
  ctx: MutationCtx,
  { workId, context, result }: {
    workId: string;
    context: { dataset: 'onlineStatus' | 'characterLocation'; userId: string };
    result: { kind: 'success' } | { kind: 'failed'; error: string };
  },
): Promise<void> {
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
}

export const onSyncComplete = internalMutation({
  args: onSyncCompleteArgs,
  handler: completeSyncRun,
});
