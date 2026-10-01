import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { pendingTrackingMerges, type TrackingSelection } from './schema';
import { MERGE_RECEIPT_BATCH_SIZE } from './constants';

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

const operationIdSchema = z.guid();

export async function readPendingTrackingOperationIds(
  operationIds: readonly string[],
  database: AnyPgDb = db,
): Promise<ReadonlySet<string>> {
  if (operationIds.length > MERGE_RECEIPT_BATCH_SIZE) {
    throw new Error('Too many tracking operations to check in one batch');
  }
  const ids = operationIds.filter((id) => operationIdSchema.safeParse(id).success);
  if (ids.length === 0) return new Set();
  const pending = await database.select({ id: pendingTrackingMerges.id })
    .from(pendingTrackingMerges)
    .where(inArray(pendingTrackingMerges.id, ids))
    .limit(MERGE_RECEIPT_BATCH_SIZE);
  return new Set(pending.map(({ id }) => id));
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
