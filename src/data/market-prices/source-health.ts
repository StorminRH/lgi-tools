import type { PriceSourceCounts } from '@/lib/alerts';

/**
 * Projects a price read onto exactly its four source counts and says whether it degraded: any row
 * served by the Fuzzwork fallback, or an exhausted ESI budget. The cron sweep (persisted rows) and
 * the on-demand route (live fetches) share this, so the price_source_degraded rows both callers
 * write, and the admin readers that compare them, stay in lockstep. The projection is explicit
 * because a refresh summary also carries requested, written and durationMs.
 */
export function readPriceSourceHealth(source: PriceSourceCounts): {
  counts: PriceSourceCounts;
  degraded: boolean;
} {
  const counts: PriceSourceCounts = {
    fetched: source.fetched,
    esiCount: source.esiCount,
    fuzzworkFallbackCount: source.fuzzworkFallbackCount,
    budgetExhausted: source.budgetExhausted,
  };
  return { counts, degraded: counts.fuzzworkFallbackCount > 0 || counts.budgetExhausted };
}
