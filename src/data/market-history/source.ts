import { z } from 'zod';
import { fetchStoredMany, type StoredManyAnswer } from '@/data/esi-store';
import { EsiBudgetExhaustedError, EsiContractError } from '@/platform/esi';
import { dedupe } from '@/lib/array';
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
 * One type's series from the batched store read: a 200 comes back with
 * its meta to commit once the rows are written; unexpired, a 304, the
 * downtime halt, an error status or a malformed body leave the stored
 * series standing, and a refused call says so.
 */
async function readOneType(typeId: number, answer: StoredManyAnswer): Promise<RawHistory | null> {
  if (answer.kind === 'failed') throw answer.error;
  if (answer.kind !== 'fresh') return null;
  return { typeId, rows: parseEsiHistory(await answer.res.json()), meta: answer.meta, source: 'esi' };
}

/**
 * Every type's series through one store read, HISTORY_FETCH_CONCURRENCY
 * calls in flight and one write for the 304s. A type that fails for any
 * reason but budget keeps its stored series; a budget refusal is reported.
 */
export async function fetchHistoryFromSource(
  typeIds: number[],
): Promise<{ results: RawHistory[]; budgetExhausted: boolean }> {
  if (typeIds.length === 0) return { results: [], budgetExhausted: false };
  const unique = dedupe(typeIds);
  const answers = await fetchStoredMany(unique.map(historyKey), { concurrency: HISTORY_FETCH_CONCURRENCY });
  const results: RawHistory[] = [];
  let budgetExhausted = false;

  for (const [i, typeId] of unique.entries()) {
    try {
      const read = await readOneType(typeId, answers[i]!);
      if (read !== null) results.push(read);
    } catch (err) {
      if (err instanceof EsiBudgetExhaustedError) budgetExhausted = true;
    }
  }

  return { results, budgetExhausted };
}
