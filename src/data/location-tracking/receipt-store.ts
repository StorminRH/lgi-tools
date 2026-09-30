import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { RECEIPT_CLEANUP_TASK } from './constants';
import { trackingReceiptCleanup } from './schema';

export interface ReceiptCleanupCheckpoint {
  readonly cutoffMs: number;
  readonly cursor: string | null;
}

export async function readOrCreateReceiptCleanupCheckpoint(
  cutoffMs: number,
  database: AnyPgDb = db,
): Promise<ReceiptCleanupCheckpoint> {
  await database.insert(trackingReceiptCleanup)
    .values({ task: RECEIPT_CLEANUP_TASK, cutoffMs, cursor: null })
    .onConflictDoNothing();
  const [checkpoint] = await database.select({
    cutoffMs: trackingReceiptCleanup.cutoffMs, cursor: trackingReceiptCleanup.cursor,
  }).from(trackingReceiptCleanup).where(eq(trackingReceiptCleanup.task, RECEIPT_CLEANUP_TASK)).limit(1);
  if (checkpoint === undefined) throw new Error('Tracking receipt checkpoint changed during initialization');
  return checkpoint;
}

export async function saveReceiptCleanupCheckpoint(
  previous: ReceiptCleanupCheckpoint,
  cursor: string | null,
  database: AnyPgDb = db,
): Promise<boolean> {
  const current = and(
    eq(trackingReceiptCleanup.task, RECEIPT_CLEANUP_TASK),
    eq(trackingReceiptCleanup.cutoffMs, previous.cutoffMs),
    previous.cursor === null
      ? isNull(trackingReceiptCleanup.cursor)
      : eq(trackingReceiptCleanup.cursor, previous.cursor),
  );
  const changed = cursor === null
    ? await database.delete(trackingReceiptCleanup).where(current).returning({ task: trackingReceiptCleanup.task })
    : await database.update(trackingReceiptCleanup).set({ cursor }).where(current).returning({ task: trackingReceiptCleanup.task });
  return changed.length === 1;
}
