import { z } from 'zod';
import { fetchStored } from '@/data/esi-store';
import { EsiBudgetExhaustedError, EsiContractError } from '@/platform/esi';
import { dedupe } from '@/lib/array';
import { mapConcurrent } from '@/lib/fan-out';
import { HISTORY_FETCH_CONCURRENCY } from './constants';
import { historyKey } from './keys';
import type { HistoryDailyRow, RawHistory } from './types';

const esiHistoryItemSchema = z.object({
  date: z.string(),
  average: z.number(),
  highest: z.number(),
  lowest: z.number(),
  order_count: z.number(),
  volume: z.number(),
});
const esiHistorySchema = z.array(esiHistoryItemSchema);

export function parseEsiHistory(body: unknown): HistoryDailyRow[] {
  const result = esiHistorySchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data.map((r) => ({
    date: r.date,
    average: r.average,
    highest: r.highest,
    lowest: r.lowest,
    volume: BigInt(Math.trunc(r.volume)),
    orderCount: Math.trunc(r.order_count),
  }));
}

/**
 * One type's series through the store: a 200 comes back with its meta to
 * commit once the rows are written; unexpired, a 304, a busy lock, an
 * error status or a malformed body leave the stored series standing.
 */
async function readOneType(typeId: number): Promise<RawHistory | null> {
  const result = await fetchStored(historyKey(typeId));
  if (result.kind !== 'fresh') return null;
  return { typeId, rows: parseEsiHistory(await result.res.json()), meta: result.meta, source: 'esi' };
}

export async function fetchHistoryFromSource(
  typeIds: number[],
): Promise<{ results: RawHistory[]; budgetExhausted: boolean }> {
  if (typeIds.length === 0) return { results: [], budgetExhausted: false };
  const unique = dedupe(typeIds);
  const results: RawHistory[] = [];
  let budgetExhausted = false;

  await mapConcurrent(unique, HISTORY_FETCH_CONCURRENCY, async (typeId) => {
    if (budgetExhausted) return;
    try {
      const read = await readOneType(typeId);
      if (read !== null) results.push(read);
    } catch (err) {
      if (err instanceof EsiBudgetExhaustedError) budgetExhausted = true;
    }
  });

  return { results, budgetExhausted };
}
