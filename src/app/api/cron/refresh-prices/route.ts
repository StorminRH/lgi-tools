import { refreshStalePrices } from '@/data/market-prices/cache';
import { db } from '@/db';

// Vercel-cron endpoint. Wired to "0 11 * * *" in vercel.json (daily at
// 11:00 UTC — Vercel Hobby caps crons at daily cadence). Vercel's cron
// invoker sends GET with `Authorization: Bearer ${CRON_SECRET}`; reject
// anything else with 401 so the URL stays inert if scraped.
//
// `force: true` means refresh every tracked type ID, not just the
// stale subset — used here because the cron is the authoritative
// refresher and should always actually refresh when it fires, even if
// an on-demand call updated some rows in the same window. The advisory
// lock inside refreshStalePrices still serializes concurrent callers;
// `force` widens the set, it doesn't bypass the lock.
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response('CRON_SECRET not configured', { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await refreshStalePrices(db, { force: true });
  return Response.json({
    cached: result.status === 'cached',
    lastUpdatedAt: result.lastUpdatedAt?.toISOString() ?? null,
    ...(result.status === 'refreshed' && {
      fetched: result.summary.fetched,
      written: result.summary.written,
    }),
  });
}
