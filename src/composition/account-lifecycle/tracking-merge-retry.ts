import { and, eq } from 'drizzle-orm';
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

export async function reconcileTrackingMerges(
  userId?: string,
  database?: PostgresJsDb,
): Promise<{ processed: number; failed: number }> {
  const pending = await readPendingTrackingMerges(userId);
  if (pending.length === 0) return { processed: 0, failed: 0 };
  const writer = database ?? directDatabase();
  const deadline = Date.now() + MAP_ACCESS_RECONCILE_BUDGET_MS;
  let processed = 0;
  let failed = 0;
  for (const job of pending) {
    if (Date.now() >= deadline) break;
    try {
      await deliverTrackingMerge(writer, job);
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error('[account-merge] tracking transfer retained for retry', job.id, error);
      await writer.update(pendingTrackingMerges).set({ queuedAt: new Date() })
        .where(eq(pendingTrackingMerges.id, job.id));
    }
  }
  return { processed, failed };
}
