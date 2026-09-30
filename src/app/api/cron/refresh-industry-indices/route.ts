import type { CronRefreshIndustryIndicesResponse } from '@/data/industry-indices/api-contract';
import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import { refreshIndustryIndicesDeclaration } from './declaration';

/**
 * Runs as a step of the daily-batch cron, after the prices sweep; this route
 * is the manual entry point, taking `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Refreshes both daily CCP industry datasets (system cost indices + adjusted
 * prices) under the shared cron gate's advisory lock, which skips an
 * overlapping run of itself — the upserts are idempotent, so the lock guards
 * against a redundant double ESI pull, not data integrity. Two bulk fetches +
 * chunked upserts complete in a few seconds; 60 bounds a hang well under the
 * 300s platform default.
 */
export const maxDuration = 60;

// authz: cron
// input: none
export const GET = defineCronRoute<CronRefreshIndustryIndicesResponse>(
  refreshIndustryIndicesDeclaration,
);
