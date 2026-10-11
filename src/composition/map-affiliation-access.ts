import { reconcileTrackingMerges } from './account-lifecycle/tracking-merge-retry';
import type { PendingMapAccessChange } from '@/data/maps/authorization-sql';
import { mapConcurrent } from '@/lib/fan-out';
import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import {
  acknowledgeMapAccessChanges,
  MAX_PENDING_BATCH,
  readPendingMapAccessChanges,
} from '@/platform/auth/affiliation-store';
import { projectMapAccess, requireCurrentProjection } from './map-access-projection';

const RECONCILE_BUDGET_MS = 20_000;
const DELIVERY_TIMEOUT_MS = 4_000;
const FINALIZE_RESERVE_MS = 1_000;
const DELIVERY_CONCURRENCY = 4;
// Visits inside this window share one drain. No cron drains map_access_changes, so keep it
// short: a change delivered by a visit can wait up to this much longer.
const VISIT_DRAIN_INTERVAL_MS = 15_000;

let visitDrain: { startedAt: number; run: Promise<{ processed: number; failed: number }> } | null = null;

export async function reconcileAffiliationAccess(): Promise<{ processed: number; failed: number }> {
  await reconcileTrackingMerges();
  return deliverPendingMapAccessChanges(await readPendingMapAccessChanges());
}

/**
 * The opportunistic drain for page and session visits. Visits on this instance
 * share one run per {@link VISIT_DRAIN_INTERVAL_MS}, and a failed run lets the
 * next visit retry. Callers that just queued changes use
 * {@link reconcileAffiliationAccess}, which is never coalesced.
 */
export function reconcileAffiliationAccessOnVisit(): Promise<{ processed: number; failed: number }> {
  const now = Date.now();
  if (visitDrain && now - visitDrain.startedAt < VISIT_DRAIN_INTERVAL_MS) return visitDrain.run;
  const drain = { startedAt: now, run: reconcileAffiliationAccess() };
  visitDrain = drain;
  drain.run.catch(() => {
    if (visitDrain === drain) visitDrain = null;
  });
  return drain.run;
}

export async function deliverCapturedMapAccessChanges(
  changes: PendingMapAccessChange[],
): Promise<{ processed: number; failed: number }> {
  const captured = await deliverPendingMapAccessChanges(changes.slice(0, MAX_PENDING_BATCH));
  if (changes.length <= MAX_PENDING_BATCH) return captured;
  const overflow = await reconcileAffiliationAccess();
  return {
    processed: captured.processed + overflow.processed,
    failed: captured.failed + overflow.failed,
  };
}

async function deliverPendingMapAccessChanges(
  pending: PendingMapAccessChange[],
): Promise<{ processed: number; failed: number }> {
  const deadline = Date.now() + RECONCILE_BUDGET_MS;
  if (pending.length === 0) return { processed: 0, failed: 0 };
  const mapIds = pending.map((row) => row.mapId);
  const succeeded = new Set<string>();
  await mapConcurrent(mapIds, DELIVERY_CONCURRENCY, async (mapId) => {
    const remaining = deadline - Date.now() - FINALIZE_RESERVE_MS;
    if (remaining <= 0) return;
    try {
      requireCurrentProjection(await projectMapAccess(mapId, {
        timeoutMs: Math.min(DELIVERY_TIMEOUT_MS, remaining),
      }));
      succeeded.add(mapId);
    } catch (error) {
      console.error('[map-affiliation-access] projection retained for retry', mapId, error);
    }
  });
  const completed = pending.filter((row) => succeeded.has(row.mapId));
  const retry = pending.filter((row) => !succeeded.has(row.mapId));
  await acknowledgeMapAccessChanges(completed, retry);
  return { processed: completed.length, failed: pending.length - completed.length };
}

export async function refreshAffiliationsAndReconcile(characterIds: number[]): Promise<void> {
  const result = await refreshAffiliationsWithOutcome(characterIds);
  if (result.accessChanged) await reconcileAffiliationAccess();
}
