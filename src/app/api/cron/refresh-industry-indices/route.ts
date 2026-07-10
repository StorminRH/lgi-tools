import { drizzle } from 'drizzle-orm/postgres-js';
import type { CronRefreshIndustryIndicesResponse } from '@/data/industry-indices/api-contract';
import { ADVISORY_LOCK_INDUSTRY_INDICES } from '@/data/industry-indices/constants';
import { refreshIndustryIndices } from '@/data/industry-indices/ingest';
import { cronLogger } from '@/data/telemetry/cron-logger';
import { directClient } from '@/db';
import { runCronJob } from '@/db/cron-gate';

const logCronEvent = cronLogger('cron:industry-indices', 'cron_industry_indices');

// Vercel cron endpoint. Wired to "40 11 * * *" in vercel.json (11:40 UTC —
// after the 11:00–11:15 daily downtime and clear of the 11:30 prices sweep on
// the direct Neon endpoint). Vercel dispatches GET with
// `Authorization: Bearer ${CRON_SECRET}`.
//
// Refreshes both daily CCP industry datasets (system cost indices + adjusted
// prices) under the shared cron gate's advisory lock, which skips an
// overlapping run of itself — the upserts are idempotent, so the lock guards
// against a redundant double ESI pull, not data integrity. Two bulk fetches +
// chunked upserts complete in a few seconds; 60 bounds a hang well under the
// 300s platform default.
export const maxDuration = 60;

const LOCK_KEY_NUM = Number(ADVISORY_LOCK_INDUSTRY_INDICES);

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
      return Response.json({ status: 'busy' } satisfies CronRefreshIndustryIndicesResponse);
    },
    work: async () => {
      // Work on the directClient pool; the lock stays on the gate's reserved
      // connection. The ESI fetch happens with no transaction open, so no
      // connection is pinned across the network round-trip.
      const summary = await refreshIndustryIndices(drizzle(directClient));

      // O-2: structured outcome + durable telemetry. Each dataset's ok flag makes
      // a partial failure (one endpoint down) visible without an alert channel.
      await logCronEvent({
        outcome: 'refreshed',
        costIndices: summary.costIndices,
        adjustedPrices: summary.adjustedPrices,
        durationMs: summary.durationMs,
      });

      return Response.json({
        status: 'refreshed',
        costIndices: { ok: summary.costIndices.ok, written: summary.costIndices.written },
        adjustedPrices: {
          ok: summary.adjustedPrices.ok,
          written: summary.adjustedPrices.written,
        },
      } satisfies CronRefreshIndustryIndicesResponse);
    },
  });
}
