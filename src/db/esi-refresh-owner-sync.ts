import { enqueueEsiRefreshJob } from '@/data/esi-refresh-jobs/queries';
import type { EsiRefreshDataset } from '@/data/esi-refresh-jobs/types';
import type {
  OwnerSyncResult,
  OwnerSyncRunOptions,
  OwnerSyncTarget,
} from '@/lib/owner-sync';

/**
 * Records a budget-blocked owner refresh in the durable queue and returns the existing deferred
 * outcome without performing the owner read.
 */
export function enqueueBudgetDeferral(
  dataset: EsiRefreshDataset,
  userId: string,
): OwnerSyncRunOptions {
  return {
    onBudgetDeferred: (target, error) =>
      enqueueEsiRefreshJob({ dataset, userId, target, error }).then(() => undefined),
  };
}

/**
 * Selects the refresh result for the requested owner from a batch outcome, preserving explicit
 * skipped, deferred, and failed states.
 */
export function targetedOwnerResult(
  target: OwnerSyncTarget,
  results: OwnerSyncResult[],
): OwnerSyncResult {
  return (
    results.find(
      (result) =>
        result.target.ownerType === target.ownerType && result.target.ownerId === target.ownerId,
    ) ?? { kind: 'failed_permanent', target, code: 'owner_unavailable' }
  );
}
