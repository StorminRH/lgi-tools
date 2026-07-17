import type { CronRefreshIndustryIndicesResponse } from '@/data/industry-indices/api-contract';
import { defineCronRoute } from '@/db/cron-gate';
import { refreshIndustryIndicesDeclaration } from './declaration';

/**
 * Vercel cron endpoint. Wired to "40 11 * * *" in vercel.json (11:40 UTC —
 * after the 11:00–11:15 daily downtime and clear of the 11:30 prices sweep on
 * the direct Neon endpoint). Vercel dispatches GET with
 * `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Refreshes both daily CCP industry datasets (system cost indices + adjusted
 * prices) under the shared cron gate's advisory lock, which skips an
 * overlapping run of itself — the upserts are idempotent, so the lock guards
 * against a redundant double ESI pull, not data integrity. Two bulk fetches +
 * chunked upserts complete in a few seconds; 60 bounds a hang well under the
 * 300s platform default.
 */
export const maxDuration = 60;

/**
 * Runs the declared industry-index batch; accepts only cron bearer auth and
 * consumes no body or query parameters.
 */
// authz: cron
// input: none
export const GET = defineCronRoute<CronRefreshIndustryIndicesResponse>(
  refreshIndustryIndicesDeclaration,
);
