import { revalidateTag } from 'next/cache';
import { connection } from 'next/server';
import type { CronRefreshPricesResponse } from '@/data/market-prices/api-contract';
import { PRICES_FRESHNESS_TAG, refreshStalePrices } from '@/data/market-prices/cache';
import { logUsageEvent } from '@/data/telemetry/queries';
import type { UsageAction } from '@/data/telemetry/types';
import { directClient } from '@/db';
import { alertPriceSourceDegradation } from '@/lib/alerts';
import { readEnv } from '@/lib/env';

// Awaits a fire-and-forget side effect, swallowing failures so observability
// can never break the cron, and awaiting so the write/alert lands before the
// serverless function freezes on return (3.0.10).
async function swallow(label: string, p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    console.error(label, err);
  }
}

async function logCronEvent(
  action: UsageAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  await swallow('[cron:prices] telemetry write failed', logUsageEvent({ action, metadata }));
}

// Vercel-cron endpoint, scheduled in vercel.json. Vercel's cron invoker
// sends GET with `Authorization: Bearer ${CRON_SECRET}`; reject anything
// else with 401 so the URL stays inert if scraped.
//
// Nightly backstop (11:30 UTC — EVE's low-traffic trough, clear of the
// 11:00–11:15 UTC downtime when ESI is offline). The live user path
// refreshes prices on view, so this sweep only bounds staleness to ~24h
// for the cases the browser-side refresh never reaches (ESI down, server-
// rendered snapshots, crawlers, link-preview embeds). It's lock-free: the
// cron is the only bulk writer, and a race with an on-demand write is
// last-write-wins (both write fresh rows). We pass `directClient` — the
// sweep runs on the cron's existing postgres-js client.
// No user input — bearer-auth only, body and query params ignored.
// authz: cron
export async function GET(req: Request): Promise<Response> {
  // Cron endpoint: runs per-invocation and writes. Defer to request time so
  // Cache Components doesn't try to prerender it.
  const start = Date.now();
  await connection();
  const secret = readEnv('CRON_SECRET');
  if (!secret) {
    return new Response('CRON_SECRET not configured', { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await refreshStalePrices(directClient);
  const durationMs = Date.now() - start;

  if (result.status === 'cached') {
    // O-3: a skipped run (nothing was stale) must be distinguishable from a
    // healthy refresh in the record.
    const outcome = { scope: 'cron:prices', outcome: 'skipped', reason: result.reason, durationMs };
    console.log(JSON.stringify(outcome));
    await logCronEvent('cron_prices', { outcome: 'skipped', reason: result.reason, durationMs });
    return Response.json({
      cached: true,
      lastUpdatedAt: result.lastUpdatedAt?.toISOString() ?? null,
    } satisfies CronRefreshPricesResponse);
  }

  // The header's freshness chip reads a `use cache` snapshot of the latest
  // price timestamp; nudge that cache to the new value as soon as the nightly
  // write lands (the `'hours'` cacheLife provides sub-day freshness between
  // runs; the tag gives the immediate post-refresh bump).
  revalidateTag(PRICES_FRESHNESS_TAG, 'max');

  const { summary } = result;
  const degraded = summary.fuzzworkFallbackCount > 0 || summary.budgetExhausted;

  // O-2: structured boundary line (runtime logs) + durable telemetry row.
  const outcome = {
    scope: 'cron:prices',
    outcome: 'refreshed',
    fetched: summary.fetched,
    written: summary.written,
    esiCount: summary.esiCount,
    fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
    budgetExhausted: summary.budgetExhausted,
    durationMs,
  };
  console.log(JSON.stringify(outcome));
  await logCronEvent('cron_prices', {
    outcome: 'refreshed',
    fetched: summary.fetched,
    written: summary.written,
    esiCount: summary.esiCount,
    fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
    budgetExhausted: summary.budgetExhausted,
    durationMs,
  });

  if (degraded) {
    // O-1 + S-2: degradation telemetry, plus a cron-only Discord ops alert
    // (the public on-demand path emits telemetry but never an alert, so it
    // can't be driven to post to Discord).
    await logCronEvent('price_source_degraded', {
      caller: 'cron',
      fetched: summary.fetched,
      esiCount: summary.esiCount,
      fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
      budgetExhausted: summary.budgetExhausted,
    });
    await swallow(
      '[cron:prices] degradation alert failed',
      alertPriceSourceDegradation({
        fetched: summary.fetched,
        esiCount: summary.esiCount,
        fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
        budgetExhausted: summary.budgetExhausted,
      }),
    );
  }

  return Response.json({
    cached: false,
    lastUpdatedAt: result.lastUpdatedAt.toISOString(),
    fetched: summary.fetched,
    written: summary.written,
  } satisfies CronRefreshPricesResponse);
}
