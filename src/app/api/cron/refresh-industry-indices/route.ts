import { drizzle } from 'drizzle-orm/postgres-js';
import type { CronRefreshIndustryIndicesResponse } from '@/data/industry-indices/api-contract';
import { ADVISORY_LOCK_INDUSTRY_INDICES } from '@/data/industry-indices/constants';
import { refreshIndustryIndices } from '@/data/industry-indices/ingest';
import { logUsageEvent } from '@/data/telemetry/queries';
import { directClient } from '@/db';
import { requireCronAuth } from '@/lib/cron';

// Awaited fire-and-forget telemetry: the structured boundary line surfaces in
// Vercel runtime logs; the usage row is swallowed so observability never breaks
// the cron, and awaited so it lands before the function freezes (3.0.10 O-2).
async function logCronEvent(metadata: Record<string, unknown>): Promise<void> {
  console.log(JSON.stringify({ scope: 'cron:industry-indices', ...metadata }));
  try {
    await logUsageEvent({ action: 'cron_industry_indices', metadata });
  } catch (err) {
    console.error('[cron:industry-indices] telemetry write failed', err);
  }
}

// Vercel cron endpoint. Wired to "40 11 * * *" in vercel.json (11:40 UTC —
// after the 11:00–11:15 daily downtime and clear of the 11:30 prices sweep on
// the direct Neon endpoint). Vercel dispatches GET with
// `Authorization: Bearer ${CRON_SECRET}`.
//
// Refreshes both daily CCP industry datasets (system cost indices + adjusted
// prices) under an advisory lock that skips an overlapping run of itself — the
// upserts are idempotent, so the lock guards against a redundant double ESI
// pull, not data integrity. Two bulk fetches + chunked upserts complete in a
// few seconds; 60 bounds a hang well under the 300s platform default.
export const maxDuration = 60;

const LOCK_KEY_NUM = Number(ADVISORY_LOCK_INDUSTRY_INDICES);

// No user input — bearer-auth only, no body or query params consumed.
// authz: cron
export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const start = Date.now();

  const reserved = await directClient.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      // Another refresh holds the lock — skip rather than double-pull ESI.
      await logCronEvent({ outcome: 'busy', durationMs: Date.now() - start });
      return Response.json({ status: 'busy' } satisfies CronRefreshIndustryIndicesResponse);
    }
    lockHeld = true;

    // Work on the directClient pool; the lock stays on `reserved`. The ESI
    // fetch happens with no transaction open, so no connection is pinned across
    // the network round-trip.
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
  } finally {
    if (lockHeld) {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    }
    reserved.release();
  }
}
