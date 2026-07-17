import { and, eq, lt, sql } from 'drizzle-orm';
import { chunk } from '@/lib/array';
import { HISTORY_RETENTION_DAYS } from './constants';
import { marketHistory, marketHistoryMeta } from './schema';
import type { HistoryDailyRow, HistorySource } from './types';
import type { AnyPgDb } from '@/lib/db-types';

// Postgres caps a statement at 65535 bind params; 7 cols/row → ~9k rows max.
// A type's series is ~409 rows, but chunk for safety/headroom.
const UPSERT_CHUNK_SIZE = 1000;

// EXCLUDED is the proposed-but-conflicted row inside ON CONFLICT.
function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

// `today - HISTORY_RETENTION_DAYS` as a "YYYY-MM-DD" string, the prune cutoff.
function retentionCutoff(now: Date): string {
  const cutoff = new Date(now.getTime() - HISTORY_RETENTION_DAYS * 86_400_000);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * Persist one type's freshly fetched daily series: upsert the returned window by
 * (type_id, date), prune rows older than the retention cutoff, and upsert the
 * per-type freshness/provenance meta. Statements run sequentially (no
 * interactive transaction — the neon-http request path has none); each is
 * idempotent and last-write-wins, so a partial failure just leaves meta unbumped
 * and the next view refetches.
 */
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
