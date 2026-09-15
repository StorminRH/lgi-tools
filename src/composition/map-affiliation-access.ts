import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import {
  acknowledgeMapAccessChanges,
  readPendingMapAccessChanges,
  type PendingMapAccessChange,
} from '@/platform/auth/affiliation-store';
import { projectMapAccess, requireCurrentProjection } from './map-access-projection';

const RECONCILE_BUDGET_MS = 20_000;
const DELIVERY_TIMEOUT_MS = 4_000;
const FINALIZE_RESERVE_MS = 1_000;
const DELIVERY_CONCURRENCY = 4;

export async function reconcileAffiliationAccess(
  changes?: PendingMapAccessChange[],
): Promise<{ processed: number; failed: number }> {
  const deadline = Date.now() + RECONCILE_BUDGET_MS;
  const pending = changes?.slice(0, 100) ?? await readPendingMapAccessChanges();
  if (pending.length === 0) return { processed: 0, failed: 0 };
  const mapIds = pending.map((row) => row.mapId);
  const succeeded = new Set<string>();
  let next = 0;
  await Promise.all(Array.from({ length: DELIVERY_CONCURRENCY }, async () => {
    while (next < mapIds.length) {
      const remaining = deadline - Date.now() - FINALIZE_RESERVE_MS;
      if (remaining <= 0) return;
      const mapId = mapIds[next++]!;
      try {
        requireCurrentProjection(await projectMapAccess(mapId, {
          timeoutMs: Math.min(DELIVERY_TIMEOUT_MS, remaining),
        }));
        succeeded.add(mapId);
      } catch (error) {
        console.error('[map-affiliation-access] projection retained for retry', mapId, error);
      }
    }
  }));
  const completed = pending.filter((row) => succeeded.has(row.mapId));
  const retry = pending.filter((row) => !succeeded.has(row.mapId));
  await acknowledgeMapAccessChanges(completed, retry);
  return { processed: completed.length, failed: pending.length - completed.length };
}

export async function refreshAffiliationsAndReconcile(characterIds: number[]): Promise<void> {
  const result = await refreshAffiliationsWithOutcome(characterIds);
  if (result.accessChanged) await reconcileAffiliationAccess();
}
