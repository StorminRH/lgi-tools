import { refreshKnownPricesIfStale } from '@/data/market-prices/cache';
import { db } from '@/db';

// Public refresh endpoint. The 24-hour cache inside
// refreshKnownPricesIfStale is the rate limiter — a hand-crafted curl
// gets the same cache-hit response as the on-page button. No body, no
// auth.
export async function POST(): Promise<Response> {
  const result = await refreshKnownPricesIfStale(db);
  return Response.json({
    cached: result.status === 'cached',
    lastUpdatedAt: result.lastUpdatedAt.toISOString(),
    ...(result.status === 'refreshed' && {
      fetched: result.summary.fetched,
      written: result.summary.written,
    }),
  });
}
