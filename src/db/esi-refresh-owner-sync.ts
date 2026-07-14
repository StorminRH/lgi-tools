import { enqueueEsiRefreshJob } from '@/data/esi-refresh-jobs/queries';
import type { EsiRefreshDataset } from '@/data/esi-refresh-jobs/types';
import type {
  OwnerSyncResult,
  OwnerSyncRunOptions,
  OwnerSyncTarget,
} from '@/lib/owner-sync';

export function enqueueBudgetDeferral(
  dataset: EsiRefreshDataset,
  userId: string,
): OwnerSyncRunOptions {
  return {
    onBudgetDeferred: (target, error) =>
      enqueueEsiRefreshJob({ dataset, userId, target, error }).then(() => undefined),
  };
}

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
