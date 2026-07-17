import type { CronRefreshPricesResponse } from '@/data/market-prices/api-contract';
import { defineCronRoute } from '@/db/cron-gate';
import { refreshPricesDeclaration } from './declaration';

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
// last-write-wins (both write fresh rows).

/**
 * Worst observed sweep is ~37s (a full stale set: ESI batches + Fuzzwork
 * fallback); 120 gives that headroom while still bounding a hang at well
 * under the 300s platform default.
 */
export const maxDuration = 120;

/**
 * Runs the declared nightly price backstop; accepts only cron bearer auth and
 * consumes no body or query parameters.
 */
// authz: cron
export const GET = defineCronRoute<CronRefreshPricesResponse>(
  refreshPricesDeclaration,
);
