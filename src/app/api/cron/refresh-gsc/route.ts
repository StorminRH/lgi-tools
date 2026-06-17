import type { CronRefreshGscResponse } from '@/data/gsc/api-contract';
import { syncGsc } from '@/data/gsc/ingest';
import { logUsageEvent } from '@/data/telemetry/queries';
import { directClient } from '@/db';
import { requireCronAuth, swallow } from '@/lib/cron';

// Vercel-cron endpoint, scheduled in vercel.json ("0 9 * * *" — daily, clear of
// the 11:30 prices sweep and the Monday SDE run). Vercel's cron invoker sends
// GET with `Authorization: Bearer ${CRON_SECRET}`; reject anything else with 401
// so the URL stays inert if scraped.
//
// Pulls Google Search Console snapshots into our own tables; the admin
// dashboard reads only the stored copy. A failed/throttled sync degrades to the
// last snapshot (the page shows last-known, not broken) and is logged here.
// Logging the sync OUTCOME to usage_logs is cron observability — same as
// cron_prices/cron_sde — not GSC data mixed into telemetry; the GSC data itself
// lives only in the gsc_* tables. No GSC config → the sync no-ops (skipped).
// No user input — bearer-auth only, body and query params ignored.
// authz: cron
export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const summary = await syncGsc(directClient);

  // Structured boundary line (runtime logs) + durable telemetry row. `outcome`
  // mirrors the price cron so a skipped/failed/partial run is distinguishable
  // from a healthy sync in the record.
  const outcome = {
    scope: 'cron:gsc',
    outcome: summary.status,
    searchRows: summary.searchRows,
    sitemaps: summary.sitemaps,
    urlsInspected: summary.urlsInspected,
    errorCount: summary.errors.length,
    durationMs: summary.durationMs,
  };
  console.log(JSON.stringify(outcome));
  await swallow(
    '[cron:gsc] telemetry write failed',
    logUsageEvent({
      action: 'cron_gsc',
      metadata: {
        outcome: summary.status,
        reason: summary.reason,
        searchRows: summary.searchRows,
        sitemaps: summary.sitemaps,
        urlsInspected: summary.urlsInspected,
        errorCount: summary.errors.length,
        durationMs: summary.durationMs,
      },
    }),
  );

  return Response.json(summary satisfies CronRefreshGscResponse);
}
