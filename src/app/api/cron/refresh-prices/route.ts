import { refreshKnownPricesIfStale } from '@/data/market-prices/cache';
import { db } from '@/db';

// Vercel-cron endpoint. Wired to "0 * * * *" in vercel.json. Vercel's
// cron invoker sends GET with `Authorization: Bearer ${CRON_SECRET}`;
// reject anything else with 401 so the URL stays inert if scraped.
//
// `force: true` bypasses the cache check on purpose — Vercel cron
// scheduling jitter means ticks can fire ~58–62 minutes apart, and a
// short tick would otherwise hit the 1h TTL inside
// refreshKnownPricesIfStale and silently skip. The TTL is there for
// non-cron callers (the dev CLI in src/db/refresh-prices.ts), not for
// this handler.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response('CRON_SECRET not configured', { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await refreshKnownPricesIfStale(db, { force: true });
  return Response.json({
    cached: result.status === 'cached',
    lastUpdatedAt: result.lastUpdatedAt.toISOString(),
    ...(result.status === 'refreshed' && {
      fetched: result.summary.fetched,
      written: result.summary.written,
    }),
  });
}
