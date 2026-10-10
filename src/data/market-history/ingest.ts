import { and, eq, inArray, lt } from 'drizzle-orm';
import { chunk } from '@/lib/array';
import { retentionCutoffDay, type BatchedDeleteResult } from '@/lib/batched-delete';
import { excludedSet } from '@/lib/db-upsert';
import { daysBefore } from '@/lib/iso-date';
import { HISTORY_RETENTION_DAYS } from './constants';
import { marketHistory, marketHistoryMeta } from './schema';
import type { HistoryDailyRow, HistorySource } from './types';
import type { AnyPgDb } from '@/lib/db-types';

const UPSERT_CHUNK_SIZE = 1000;
const PRUNE_TYPE_CHUNK_SIZE = 100;

/**
 * A refresh trims its own type; this trims the types that have not refreshed in
 * the last day, a chunk of types at a time through the (type_id, date) key.
 */
export async function pruneStaleMarketHistory(
  db: AnyPgDb,
  now: Date = new Date(),
  deadline = Number.POSITIVE_INFINITY,
): Promise<BatchedDeleteResult> {
  const cutoff = retentionCutoffDay(HISTORY_RETENTION_DAYS, now);
  const stale = await db
    .select({ typeId: marketHistoryMeta.typeId })
    .from(marketHistoryMeta)
    .where(lt(marketHistoryMeta.updatedAt, daysBefore(now, 1)));
  let deleted = 0;
  for (const typeIds of chunk(stale.map((row) => row.typeId), PRUNE_TYPE_CHUNK_SIZE)) {
    if (Date.now() >= deadline) return { deleted, finished: false };
    const rows = await db
      .delete(marketHistory)
      .where(and(inArray(marketHistory.typeId, typeIds), lt(marketHistory.date, cutoff)))
      .returning({ typeId: marketHistory.typeId });
    deleted += rows.length;
  }
  return { deleted, finished: true };
}

export async function persistHistory(
  db: AnyPgDb,
  typeId: number,
  rows: HistoryDailyRow[],
  staleAfter: Date,
  source: HistorySource,
): Promise<{ written: number }> {
  const updatedAt = new Date();

  let written = 0;
  for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    await db
      .insert(marketHistory)
      .values(
        batch.map((r) => ({
          typeId,
          date: r.date,
          average: r.average,
          highest: r.highest,
          lowest: r.lowest,
          volume: r.volume,
          orderCount: r.orderCount,
        })),
      )
      .onConflictDoUpdate({
        target: [marketHistory.typeId, marketHistory.date],
        set: excludedSet(marketHistory, ['average', 'highest', 'lowest', 'volume', 'orderCount']),
      });
    written += batch.length;
  }

  await db
    .delete(marketHistory)
    .where(
      and(
        eq(marketHistory.typeId, typeId),
        lt(marketHistory.date, retentionCutoffDay(HISTORY_RETENTION_DAYS, updatedAt)),
      ),
    );

  await db
    .insert(marketHistoryMeta)
    .values({ typeId, updatedAt, staleAfter, source })
    .onConflictDoUpdate({
      target: marketHistoryMeta.typeId,
      set: excludedSet(marketHistoryMeta, ['updatedAt', 'staleAfter', 'source']),
    });

  return { written };
}
