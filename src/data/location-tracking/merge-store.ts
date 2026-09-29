import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { pendingTrackingMerges, type TrackingSelection } from './schema';

export async function enqueueTrackingMerge(
  database: AnyPgDb,
  sourceUserId: string,
  survivorUserId: string,
  selections: TrackingSelection[],
): Promise<void> {
  const byMap = Map.groupBy(selections, ({ mapId }) => mapId);
  // Empty snapshots still need durable source revocation after a process crash.
  const batches = byMap.size > 0 ? [...byMap.values()] : [[]];
  await database.insert(pendingTrackingMerges).values(batches.map((rows) => ({
    userId: survivorUserId, sourceUserId, selections: rows,
  })));
}

export async function readPendingTrackingMerges(userId?: string) {
  return db.select({ id: pendingTrackingMerges.id, userId: pendingTrackingMerges.userId })
    .from(pendingTrackingMerges)
    .where(userId === undefined ? undefined : eq(pendingTrackingMerges.userId, userId))
    .orderBy(asc(pendingTrackingMerges.queuedAt), asc(pendingTrackingMerges.id)).limit(10);
}

export async function cancelPendingTracking(userId: string, characterId: number | null): Promise<void> {
  if (characterId === null) {
    await db.delete(pendingTrackingMerges).where(eq(pendingTrackingMerges.userId, userId));
    return;
  }
  await db.execute(sql`
    UPDATE ${pendingTrackingMerges} SET selections = (
      SELECT coalesce(jsonb_agg(selection), '[]'::jsonb)
      FROM jsonb_array_elements(selections) selection
      WHERE (selection->>'characterId')::bigint <> ${characterId}
    ) WHERE user_id = ${userId}
  `);
}
