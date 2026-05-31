import { revalidateTag } from 'next/cache';
import { connection } from 'next/server';
import { PRICES_FRESHNESS_TAG, refreshStalePrices } from '@/data/market-prices/cache';
import { directClient } from '@/db';

// Vercel-cron endpoint, scheduled in vercel.json. Vercel's cron invoker
// sends GET with `Authorization: Bearer ${CRON_SECRET}`; reject anything
// else with 401 so the URL stays inert if scraped.
//
// `force: true` means refresh every tracked type ID, not just the
// stale subset — used here because the cron is the authoritative
// refresher and should always actually refresh when it fires, even if
// an on-demand call updated some rows in the same window. The advisory
// lock inside refreshStalePrices still serializes concurrent callers;
// `force` widens the set, it doesn't bypass the lock. The lock lives on
// a reserved session connection — we pass `directClient` (the unpooled
// endpoint) so the session-scoped lock actually holds.
// No user input — bearer-auth only, body and query params ignored.
// authz: cron
export async function GET(req: Request): Promise<Response> {
  // Cron endpoint: runs per-invocation and writes. Defer to request time so
  // Cache Components doesn't try to prerender it.
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response('CRON_SECRET not configured', { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await refreshStalePrices(directClient, { force: true });
  if (result.status === 'refreshed') {
    // The header's freshness chip reads a `use cache` snapshot of the latest
    // price timestamp; this cron is the authoritative hourly refresher, so nudge
    // that cache to the new value as soon as the write lands (the `'hours'`
    // cacheLife is the backstop).
    revalidateTag(PRICES_FRESHNESS_TAG, 'max');
  }
  return Response.json({
    cached: result.status === 'cached',
    lastUpdatedAt: result.lastUpdatedAt?.toISOString() ?? null,
    ...(result.status === 'refreshed' && {
      fetched: result.summary.fetched,
      written: result.summary.written,
    }),
  });
}
