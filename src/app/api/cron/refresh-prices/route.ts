import { refreshKnownPricesIfStale } from '@/data/market-prices/cache';
import { db } from '@/db';

// Vercel-cron endpoint. Wired to "0 11 * * *" in vercel.json (daily at
// 11:00 UTC — Vercel Hobby caps crons at daily cadence). Vercel's cron
// invoker sends GET with `Authorization: Bearer ${CRON_SECRET}`; reject
// anything else with 401 so the URL stays inert if scraped.
//
// `force: true` bypasses the 24h TTL inside refreshKnownPricesIfStale
// on purpose — the cron is the authoritative refresher and should
// always actually refresh when it fires, even if a manual call landed
// in the same window. The TTL is there for non-cron callers (the dev
// CLI in src/db/refresh-prices.ts), not for this handler.
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
