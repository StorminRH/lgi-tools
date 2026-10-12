import { and, eq, sql } from 'drizzle-orm';
import {
  MAP_ACCESS_DELIVERY_TIMEOUT_MS,
  MAP_ACCESS_RECONCILE_BUDGET_MS,
  projectMapAccess,
  purgeUserMapAccessProjection,
} from '@/composition/map-access-projection';
import { restoreMergeTracking } from '@/data/location-tracking/merge';
import { readPendingTrackingMerges } from '@/data/location-tracking/merge-store';
import { pendingTrackingMerges } from '@/data/location-tracking/schema';
import { purgeLocationTracking } from '@/data/location-tracking/purge';
import { account } from '@/db/auth-schema';
import { directDatabase } from '@/db/direct-database';
import { lockUserRows } from '@/db/locked-user';
import type { PostgresJsDb } from '@/lib/db-types';
import { runUntilDeadline, type DeadlineBatchResult } from '@/lib/fan-out';
import { eveAccountsForUser, linkedCharacterIds } from '@/platform/auth/eve-account-shared';

async function deliverTrackingMerge(
  database: PostgresJsDb,
  pending: { id: string; userId: string },
): Promise<void> {
  await database.transaction(async (tx) => {
    // Take the merge's lockUserRows so a retry cannot restore into a login while it is being merged away.
    const [owner] = await lockUserRows(tx, [pending.userId]);
    if (owner === undefined) return;
    const [job] = await tx.select().from(pendingTrackingMerges)
      .where(and(eq(pendingTrackingMerges.id, pending.id), eq(pendingTrackingMerges.userId, owner.id)))
      .for('update');
    if (job === undefined) return;
    const linked = await tx.select({ accountId: account.accountId }).from(account)
      .where(eveAccountsForUser(owner.id)).for('update');
    const characterIds = new Set(linkedCharacterIds(linked));
    const selections = job.selections.filter((row) => characterIds.has(row.characterId));

    await purgeUserMapAccessProjection(job.sourceUserId);
    await purgeLocationTracking(job.sourceUserId, null);
    for (const mapId of new Set(selections.map((row) => row.mapId))) {
      await projectMapAccess(mapId, { timeoutMs: MAP_ACCESS_DELIVERY_TIMEOUT_MS });
    }
    await restoreMergeTracking(job.id, owner.id, selections);
    await tx.delete(pendingTrackingMerges).where(eq(pendingTrackingMerges.id, job.id));
  });
}

/**
 * Delivers the queued tracking transfers, for one survivor when `userId` is
 * given. The deadline defaults to {@link MAP_ACCESS_RECONCILE_BUDGET_MS} from
 * when the queue is read; a failed delivery keeps its job and moves it to the
 * back of the queue through `database`.
 */
export async function reconcileTrackingMerges(
  options: { readonly userId?: string; readonly database?: PostgresJsDb; readonly deadline?: number } = {},
): Promise<DeadlineBatchResult> {
  const pending = await readPendingTrackingMerges(options.userId);
  if (pending.length === 0) return { succeeded: 0, failed: 0, deferred: 0 };
  const writer = options.database ?? directDatabase();
  return runUntilDeadline(
    pending,
    options.deadline ?? Date.now() + MAP_ACCESS_RECONCILE_BUDGET_MS,
    (job) => deliverTrackingMerge(writer, job),
    async (job, error) => {
      console.error('[account-merge] tracking transfer retained for retry', job.id, error);
      await writer.update(pendingTrackingMerges).set({ queuedAt: sql`clock_timestamp()` })
        .where(eq(pendingTrackingMerges.id, job.id));
    },
  );
}
