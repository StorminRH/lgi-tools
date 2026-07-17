import type { CronSyncSweeperResponse } from '@/data/convex/api-contract';
import { defineCronRoute } from '@/db/cron-gate';
import { syncSweeperDeclaration } from './declaration';

/**
 * Vercel-cron endpoint, scheduled in vercel.json ("*\/15 * * * *"). Vercel's
 * cron invoker sends GET with `Authorization: Bearer ${CRON_SECRET}`; reject
 * anything else with 401 so the URL stays inert if scraped.
 *
 * The presence-gated sync engine's external watchdog (3.4.9): the engine's
 * own 30s Convex cron is the dispatcher; this route runs the same
 * reconciliation once from a different failure domain, so dropped timers and
 * post-deploy gaps heal within 15 minutes even if the Convex scheduler is
 * the thing that broke. A healthy sweep is observably a no-op (all counts
 * zero); `dispatched > 0` is the alarm and is logged loudly. Talks to the
 * deployment's HTTP-actions origin (.convex.site — API port + 1 locally)
 * with the service secret both sides already hold; per-character sync still
 * never rides Vercel crons — this is one coarse global reconciler.
 * No user input — bearer-auth only, body and query params ignored.
 */
// authz: cron
// rate-limit: exempt — bearer-secret service auth, not an IP-keyed public surface.
export const GET = defineCronRoute<CronSyncSweeperResponse>(
  syncSweeperDeclaration,
);
