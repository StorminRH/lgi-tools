import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';
import {
  classifyDueSubject,
  isRegisteredDataset,
  SYNC_DATASET_CONFIG,
  type DueSubjectAction,
  type SyncDataset,
} from '@/lib/sync-engine';
import { components, internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { clearCoverageForUser } from './locationCoverage';
import { getPresence } from './subjects';

const rateLimiter = new RateLimiter(components.rateLimiter, {
  syncDispatch: { kind: 'token bucket', period: MINUTE, rate: 30, capacity: 10 },
});

export const syncDatasetValidator = v.union(
  v.literal('onlineStatus'),
  v.literal('characterLocation'),
);

const SYNC_REFS = {
  characterLocation: internal.characterLocationSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

export const SCAN_DISPATCH_BATCH = 1024;

export function logBatchCapped(scope: string, note: string, processed: number): void {
  console.warn(JSON.stringify({ scope, note, processed }));
}

function dueSubjects(ctx: MutationCtx, now: number): Promise<Doc<'syncSubjects'>[]> {
  return ctx.db
    .query('syncSubjects')
    .withIndex('by_next_due', (q) => q.gt('nextDueAt', 0).lte('nextDueAt', now))
    .take(SCAN_DISPATCH_BATCH);
}

export async function retireFromScan(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
): Promise<void> {
  await ctx.db.patch(subject._id, { nextDueAt: null });
  if (subject.dataset === 'characterLocation') {
    await clearCoverageForUser(ctx, subject.userId);
  }
}

export interface DueWalkCounts {
  dispatched: number;
  retired: number;
  deleted: number;
}

export async function walkDueSubjects(
  ctx: MutationCtx,
  now: number,
  options: {
    allowDelete: boolean;
    counts?: DueWalkCounts;
    capScope: string;
    capNote: string;
  },
): Promise<void> {
  const due = await dueSubjects(ctx, now);
  for (const subject of due) {
    if (!isRegisteredDataset(subject.dataset)) {
      await retireFromScan(ctx, subject);
      if (options.counts !== undefined) options.counts.retired += 1;
      continue;
    }
    const presence = await getPresence(ctx.db, subject.dataset, subject.userId);
    const classified = classifyDueSubject(
      presence,
      subject.status,
      subject.lastRequestedAt,
      SYNC_DATASET_CONFIG[subject.dataset].coldAfterMs,
      now,
    );
    const action = classified === 'delete' && !options.allowDelete ? 'retire' : classified;
    await applyDueAction(ctx, subject, presence, action, now, options.counts);
  }
  if (due.length === SCAN_DISPATCH_BATCH) {
    logBatchCapped(options.capScope, options.capNote, due.length);
  }
}

async function applyDueAction(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
  presence: Doc<'syncPresence'> | null,
  action: DueSubjectAction,
  now: number,
  counts: DueWalkCounts | undefined,
): Promise<void> {
  switch (action) {
    case 'delete':
      await ctx.db.delete(subject._id);
      if (presence !== null) await ctx.db.delete(presence._id);
      if (counts !== undefined) counts.deleted += 1;
      return;
    case 'retire':
      await retireFromScan(ctx, subject);
      if (counts !== undefined) counts.retired += 1;
      return;
    case 'dispatch':
      if (await dispatch(ctx, subject, now) && counts !== undefined) counts.dispatched += 1;
      return;
    case 'skip':
      return;
  }
}

export async function dispatch(
  ctx: MutationCtx,
  subject: Doc<'syncSubjects'>,
  now: number,
): Promise<boolean> {
  if (!isRegisteredDataset(subject.dataset)) return false;
  const { cadenceFloorMs, tokenGroup, rateKeyScope } = SYNC_DATASET_CONFIG[subject.dataset];
  const rateKey =
    rateKeyScope === 'subject' ? `${tokenGroup}:${subject.userId}` : tokenGroup;
  const { ok, retryAfter } = await rateLimiter.limit(ctx, 'syncDispatch', { key: rateKey });
  if (!ok) {
    await ctx.db.patch(subject._id, { nextDueAt: now + retryAfter });
    return false;
  }
  const workId = String(now);
  await ctx.scheduler.runAfter(0, SYNC_REFS[subject.dataset], {
    userId: subject.userId,
    generation: now,
  });
  await ctx.db.patch(subject._id, {
    status: 'running',
    lastRequestedAt: now,
    workId,
    nextDueAt: now + cadenceFloorMs,
  });
  return true;
}
