import { asc, inArray } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db as defaultDb } from '@/db';
import { withColdStartRetry } from '@/lib/neon-cold-start-retry';
import { computeHistoryInputs } from './aggregate';
import { historyTag } from './constants';
import { marketHistory, marketHistoryMeta } from './schema';
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

  const out = new Map<number, HistoryDailyRow[]>();
  for (const r of rows) {
    const list = out.get(r.typeId) ?? [];
    list.push({
      date: r.date,
      average: r.average,
      highest: r.highest,
      lowest: r.lowest,
      volume: r.volume,
      orderCount: r.orderCount,
    });
    out.set(r.typeId, list);
  }
  return out;
}

export async function getHistoryMeta(
  typeIds: number[],
): Promise<Map<number, { staleAfter: Date }>> {
  if (typeIds.length === 0) return new Map();
  const rows = await defaultDb
    .select({
      typeId: marketHistoryMeta.typeId,
      staleAfter: marketHistoryMeta.staleAfter,
    })
    .from(marketHistoryMeta)
    .where(inArray(marketHistoryMeta.typeId, typeIds));
  const out = new Map<number, { staleAfter: Date }>();
  for (const r of rows) out.set(r.typeId, { staleAfter: r.staleAfter });
  return out;
}

export async function getMarketHistoryInputs(
  typeIds: number[],
): Promise<MarketHistoryInputs[]> {
  'use cache';
  cacheLife('hours');
  for (const id of typeIds) cacheTag(historyTag(id));

  const stored = await withColdStartRetry(() => getStoredHistory(typeIds));
  const out: MarketHistoryInputs[] = [];
  for (const id of typeIds) {
    const rows = stored.get(id);
    if (rows && rows.length > 0) out.push(computeHistoryInputs(id, rows));
  }
  return out;
}
