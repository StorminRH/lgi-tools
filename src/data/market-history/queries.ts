import { asc, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { storedExpiry, untilExpires } from '@/data/esi-store';
import { db as defaultDb } from '@/db';
import { groupBy } from '@/lib/array';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { computeHistoryInputs } from './aggregate';
import { historyKey, MARKET_HISTORY_TAG } from './keys';
import { marketHistory } from './schema';
import type { HistoryDailyRow, MarketHistoryInputs } from './types';

export async function getStoredHistory(
  typeIds: number[],
): Promise<Map<number, HistoryDailyRow[]>> {
  if (typeIds.length === 0) return new Map();
  const rows = await defaultDb
    .select({
      typeId: marketHistory.typeId,
      date: marketHistory.date,
      average: marketHistory.average,
      highest: marketHistory.highest,
      lowest: marketHistory.lowest,
      volume: marketHistory.volume,
      orderCount: marketHistory.orderCount,
    })
    .from(marketHistory)
    .where(inArray(marketHistory.typeId, typeIds))
    .orderBy(asc(marketHistory.date));

  return groupBy(rows, (r) => r.typeId, ({ typeId: _typeId, ...day }): HistoryDailyRow => day);
}

/**
 * The scoring inputs of each type's stored history, cached across instances
 * under the dataset's tag until the earliest of the requested series
 * expires; a history commit clears the tag sooner.
 */
export async function getMarketHistoryInputs(
  typeIds: number[],
): Promise<MarketHistoryInputs[]> {
  'use cache: remote';
  cacheTag(MARKET_HISTORY_TAG);
  const [stored, expiresAt] = await Promise.all([
    withColdStartRetry(() => getStoredHistory(typeIds)),
    storedExpiry(typeIds.map(historyKey)),
  ]);
  cacheLife(untilExpires(expiresAt));
  const out: MarketHistoryInputs[] = [];
  for (const id of typeIds) {
    const rows = stored.get(id);
    if (rows && rows.length > 0) out.push(computeHistoryInputs(id, rows));
  }
  return out;
}
