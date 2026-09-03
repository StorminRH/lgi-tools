import { and, eq, lt, sql } from 'drizzle-orm';
import { chunk } from '@/lib/array';
import { HISTORY_RETENTION_DAYS } from './constants';
import { marketHistory, marketHistoryMeta } from './schema';
import type { HistoryDailyRow, HistorySource } from './types';
import type { AnyPgDb } from '@/lib/db-types';

const UPSERT_CHUNK_SIZE = 1000;

function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

function retentionCutoff(now: Date): string {
  const cutoff = new Date(now.getTime() - HISTORY_RETENTION_DAYS * 86_400_000);
  return cutoff.toISOString().slice(0, 10);
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
        set: {
          average: excluded('average'),
          highest: excluded('highest'),
          lowest: excluded('lowest'),
          volume: excluded('volume'),
          orderCount: excluded('order_count'),
        },
      });
    written += batch.length;
  }

  await db
    .delete(marketHistory)
    .where(
      and(
        eq(marketHistory.typeId, typeId),
        lt(marketHistory.date, retentionCutoff(updatedAt)),
      ),
    );

  await db
    .insert(marketHistoryMeta)
    .values({ typeId, updatedAt, staleAfter, source })
    .onConflictDoUpdate({
      target: marketHistoryMeta.typeId,
      set: {
        updatedAt: excluded('updated_at'),
        staleAfter: excluded('stale_after'),
        source: excluded('source'),
      },
    });

  return { written };
}
