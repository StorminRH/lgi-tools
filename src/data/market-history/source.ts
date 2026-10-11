import { z } from 'zod';
import {
  EsiBudgetExhaustedError,
  EsiContractError,
  esiFetch,
  esiUrl,
} from '@/platform/esi';
import { httpDateMs } from '@/platform/esi/headers';
import { dedupe } from '@/lib/array';
import { mapConcurrent } from '@/lib/fan-out';
import { DAY_MS } from '@/lib/iso-date';
import { THE_FORGE_REGION_ID } from '@/data/eve-data/constants';
import { HISTORY_FETCH_CONCURRENCY } from './constants';
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

export function staleAfterFromExpires(expires: string | null, now: Date): Date {
  return new Date(httpDateMs(expires) ?? now.getTime() + DAY_MS);
}

function historyUrl(typeId: number): string {
  return esiUrl(`/markets/${THE_FORGE_REGION_ID}/history/?type_id=${typeId}`);
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
      const res = await esiFetch(historyUrl(typeId));
      if (!res.ok) return;
      const rows = parseEsiHistory(await res.json());
      const staleAfter = staleAfterFromExpires(res.headers.get('Expires'), new Date());
      results.push({ typeId, rows, staleAfter, source: 'esi' });
    } catch (err) {
      if (err instanceof EsiBudgetExhaustedError) {
        budgetExhausted = true;
        return;
      }
    }
  });

  return { results, budgetExhausted };
}
