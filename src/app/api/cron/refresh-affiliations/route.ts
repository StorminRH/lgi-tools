import { cronLogger } from '@/data/telemetry/cron-logger';
import { runCronJob } from '@/db/cron-gate';
import { ADVISORY_LOCK_AFFILIATION_REFRESH, refreshAffiliations } from '@/features/auth/affiliation';
import type { CronRefreshAffiliationsResponse } from '@/features/auth/api-contract';
import { listStaleLinkedCharacterIds } from '@/features/auth/affiliation-store';

const logCronEvent = cronLogger('cron:affiliations', 'cron_affiliations');

// Vercel cron endpoint (3.7.3.2). Wired to "20 11 * * *" in vercel.json (11:20
// UTC — after the 11:00–11:15 daily downtime and clear of the 11:30/:40/:50
// prices/indices/SDE sweeps on the direct Neon endpoint). Vercel dispatches GET
// with `Authorization: Bearer ${CRON_SECRET}`.
//
// Refreshes the cached corp affiliation of every LINKED character that has gone
// stale (> TTL) since a login/on-view last warmed it — the dormant-character
// backstop so the membership gate never fails closed on a member who just hasn't
// been active. The advisory lock (via the shared cron gate) skips an overlapping
// run of itself — the writes are idempotent, so it guards a redundant double ESI
// pull, not data integrity.
export const maxDuration = 60;

const LOCK_KEY_NUM = Number(ADVISORY_LOCK_AFFILIATION_REFRESH);

// No user input — bearer-auth only, no body or query params consumed.
// authz: cron
export async function GET(req: Request): Promise<Response> {
  const start = Date.now();
  return runCronJob({
    req,
    lockKey: LOCK_KEY_NUM,
    onBusy: async () => {
      // Another refresh holds the lock — skip rather than double-pull ESI.
      await logCronEvent({ outcome: 'busy', durationMs: Date.now() - start });
      return Response.json({ status: 'busy' } satisfies CronRefreshAffiliationsResponse);
    },
    work: async () => {
      // The lock stays on the gate's reserved connection; the enumeration +
      // bulk affiliation read + upserts run on the request `db` (small row
      // counts, no need to pin the locked backend). The ESI call happens with
      // no transaction open.
      const staleIds = await listStaleLinkedCharacterIds();
      const refreshed = await refreshAffiliations(staleIds);

      await logCronEvent({
        outcome: 'refreshed',
        stale: staleIds.length,
        refreshed,
        durationMs: Date.now() - start,
      });

      return Response.json({
        status: 'refreshed',
        stale: staleIds.length,
        refreshed,
      } satisfies CronRefreshAffiliationsResponse);
    },
  });
}
