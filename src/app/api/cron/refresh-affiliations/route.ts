import { defineCronRoute } from '@/db/cron-gate';
import type { CronRefreshAffiliationsResponse } from '@/features/auth/api-contract';
import { refreshAffiliationsDeclaration } from './declaration';

/**
 * Vercel cron endpoint (3.7.3.2). Wired to "20 11 * * *" in vercel.json (11:20
 * UTC — after the 11:00–11:15 daily downtime and clear of the 11:30/:40/:50
 * prices/indices/SDE sweeps on the direct Neon endpoint). Vercel dispatches GET
 * with `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Refreshes the cached corp affiliation of every LINKED character that has gone
 * stale (\> TTL) since a login/on-view last warmed it — the dormant-character
 * backstop so the membership gate never fails closed on a member who just hasn't
 * been active. The advisory lock (via the shared cron gate) skips an overlapping
 * run of itself — the writes are idempotent, so it guards a redundant double ESI
 * pull, not data integrity.
 */
export const maxDuration = 60;

/**
 * Runs the declared stale-affiliation batch; accepts only cron bearer auth and
 * consumes no body or query parameters.
 */
// authz: cron
export const GET = defineCronRoute<CronRefreshAffiliationsResponse>(
  refreshAffiliationsDeclaration,
);
