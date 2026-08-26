// Registration seam — all a consumer does to join:
//   1. Add the dataset + cadence floor + token group to SYNC_DATASETS /
//      SYNC_DATASET_CONFIG in src/lib/sync-engine.ts and to the schema's
//      dataset union.
//   2. Point SYNC_REFS at its internal sync action ({userId, generation};
//      only transient failures throw).
//   3. Its applySyncResults guards on generation and stamps run results
//      onto the syncSubjects row.
//   4. Its view mounts useSyncSubject (src/data/convex/).
import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';
import {
  isRegisteredDataset,
  SYNC_DATASET_CONFIG,
  type SyncDataset,
} from '@/lib/sync-engine';
import { components, internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { clearCoverageForUser } from './locationCoverage';

const rateLimiter = new RateLimiter(components.rateLimiter, {
  syncDispatch: { kind: 'token bucket', period: MINUTE, rate: 30, capacity: 10 },
});

// Stored union is a SUPERSET of the active registry while onlineStatus drains
// (docs/CONVEX.md). No syncRef is registered for retired datasets.
export const syncDatasetValidator = v.union(
  v.literal('onlineStatus'),
  v.literal('characterLocation'),
);

const SYNC_REFS = {
  characterLocation: internal.characterLocationSync.syncUser,
} satisfies Record<SyncDataset, unknown>;

/**
 * Cap for the overdue/hot-set dispatch passes (30s scan, sweep A/B). Oldest
 * first so a large due set cannot approach Convex's per-mutation read ceiling.
 */
export const SCAN_DISPATCH_BATCH = 1024;

export function logBatchCapped(scope: string, note: string, processed: number): void {
  console.warn(JSON.stringify({ scope, note, processed }));
}

export function dueSubjects(ctx: MutationCtx, now: number): Promise<Doc<'syncSubjects'>[]> {
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

// lastRequestedAt is the generation token. A superseding dispatch overwrites
// it only after isRunningFresh is false, so the new token cannot equal the
// run it supersedes. Keep the schedule transactional with — and before —
// the patch; keep isRunningFresh inside the handler so OCC retries re-check it.
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
