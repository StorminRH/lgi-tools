import { enqueueEsiRefreshJob } from '@/data/esi-refresh-jobs/queries';
import type { EsiRefreshDataset } from '@/data/esi-refresh-jobs/types';
import type {
  OwnerSyncResult,
  OwnerSyncRunOptions,
  OwnerSyncTarget,
} from '@/platform/owner-sync';

/** The outcomes that keep a queued job open, strongest first; a success settles only when none remain. */
const UNSETTLED_PRIORITY = ['deferred_for_budget', 'failed_retryable', 'failed_permanent'] as const;

function enqueueBudgetDeferral(dataset: EsiRefreshDataset, userId: string): OwnerSyncRunOptions {
  return {
    onBudgetDeferred: (target, error) =>
      enqueueEsiRefreshJob({ dataset, userId, target, error }).then(() => undefined),
  };
}

/**
 * One job's outcome among a run's results. A dataset with several descriptors
 * per owner (the sheet's sections) yields several results for one target, so a
 * deferred or failed one must outrank another section's success.
 */
function targetedOwnerResult(target: OwnerSyncTarget, results: OwnerSyncResult[]): OwnerSyncResult {
  const forTarget = results.filter(
    (result) => result.target.ownerType === target.ownerType && result.target.ownerId === target.ownerId,
  );
  for (const kind of UNSETTLED_PRIORITY) {
    const unsettled = forTarget.find((result) => result.kind === kind);
    if (unsettled !== undefined) return unsettled;
  }
  return forTarget[0] ?? { kind: 'failed_permanent', target, code: 'owner_unavailable' };
}

/**
 * Binds a deferred-queue dataset's key to its refresh: the on-view run queues
 * budget-deferred owners under `dataset`, and the worker's job runner replays
 * that same refresh for the queued target.
 */
export function ownerSyncDataset<P>(
  dataset: EsiRefreshDataset,
  makePort: () => P,
  refresh: (port: P, userId: string, options?: OwnerSyncRunOptions) => Promise<OwnerSyncResult[]>,
): {
  onView: (userId: string) => Promise<OwnerSyncResult[]>;
  runJob: (userId: string, target: OwnerSyncTarget) => Promise<OwnerSyncResult>;
} {
  return {
    onView: (userId) => refresh(makePort(), userId, enqueueBudgetDeferral(dataset, userId)),
    runJob: async (userId, target) =>
      targetedOwnerResult(target, await refresh(makePort(), userId, { target })),
  };
}
