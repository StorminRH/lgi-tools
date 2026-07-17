import { z } from 'zod';
import {
  EsiBudgetExhaustedError,
  EsiContractError,
  esiFetch,
  esiUrl,
} from '@/lib/esi';
import { dedupe } from '@/lib/array';
import {
  HISTORY_FETCH_CONCURRENCY,
  THE_FORGE_REGION_ID,
} from './constants';
import type { HistoryDailyRow, RawHistory } from './types';

// ESI source for per-type daily market history (The Forge). ESI-only: history
// has NO Fuzzwork fallback (Fuzzwork mirrors live orders, not history). Every
// call routes through the shared esiFetch gate.
//
// Gate-level 304/body caching is deliberately NOT used here. As the app fetches
// it (gzip), history is chunked with no Content-Length, so the gate's
// captureBodyForCache skips it by design (see src/lib/esi/index.ts) — and our
// own Expires-gated stale_after already deduplicates same-day re-fetches. After
// the TTL (the Expires boundary = CCP's daily recompute) the data has changed,
// so the refetch is a 200-with-new-data, not a 304 — the 304-reuse window is
// near-empty. Enabling caching would mean either reading a chunked body
// (the 3.5.g "Body has already been read" hazard) or forcing identity encoding
// (a bigger wire). Not worth it.

// ESI's /markets/{region}/history/ item shape — only the fields we use. Boundary
// schema: ESI may send more keys; z.object ignores unknowns, so an upstream
// addition can't break parsing, but a changed/missing consumed field rejects.
const esiHistoryItemSchema = z.object({
  date: z.string(),
  average: z.number(),
  highest: z.number(),
  lowest: z.number(),
  order_count: z.number(),
  volume: z.number(),
});
const esiHistorySchema = z.array(esiHistoryItemSchema);

/**
 * Validate a parsed-JSON history body and map it to our daily rows, throwing
 * EsiContractError on a shape mismatch (callers skip that type, exactly as for
 * a transient failure). Volume is an integer count → bigint.
 * Exported for testing.
 */
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
 * stale_after from the response Expires header (next CCP recompute, ~11:05 UTC),
 * falling back to now+24h when it's absent or unparseable. Exported for testing.
 */
export function staleAfterFromExpires(expires: string | null, now: Date): Date {
  if (expires !== null) {
    const parsed = new Date(expires);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

function historyUrl(typeId: number): string {
  return esiUrl(`/markets/${THE_FORGE_REGION_ID}/history/?type_id=${typeId}`);
}

// Bounded-concurrency worker pool (local — data slices can't import
// market-prices'). Workers pull from a shared cursor; a budget-exhaustion flag
// short-circuits remaining dispatch.
async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        await worker(items[i]!); // cursor < items.length checked in the while condition
      }
    },
  );
  await Promise.all(runners);
}

/**
 * Fetch daily history for each requested type. Per-type best-effort: a 4xx
 * (e.g. an invalid type), a 5xx, or a malformed body simply omits that type
 * from the results (the engine keeps the stored series). Budget exhaustion
 * stops further dispatch and is flagged for telemetry. There is no bulk
 * region-dump for history, so this is inherently one call per type.
 */
export async function fetchHistoryFromSource(
  typeIds: number[],
): Promise<{ results: RawHistory[]; budgetExhausted: boolean }> {
  if (typeIds.length === 0) return { results: [], budgetExhausted: false };
  const unique = dedupe(typeIds);
  const results: RawHistory[] = [];
  let budgetExhausted = false;

  await runConcurrent(unique, HISTORY_FETCH_CONCURRENCY, async (typeId) => {
    if (budgetExhausted) return;
    try {
      const res = await esiFetch(historyUrl(typeId));
      if (!res.ok) return; // 4xx — skip, keep the stored series
      const rows = parseEsiHistory(await res.json());
      const staleAfter = staleAfterFromExpires(res.headers.get('Expires'), new Date());
      results.push({ typeId, rows, staleAfter, source: 'esi' });
    } catch (err) {
      if (err instanceof EsiBudgetExhaustedError) {
        budgetExhausted = true;
        return;
      }
      // EsiServerError, EsiContractError (malformed body), or any transient —
      // skip this type; the engine serves its stored series.
    }
  });

  return { results, budgetExhausted };
}
