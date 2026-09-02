import type { EsiRefreshWorkerSummary } from '@/data/esi-refresh-jobs/api-contract';
import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import { drainEsiRefreshJobsDeclaration } from './declaration';

/** Maximum Vercel function execution window in seconds for this route's bounded background work. */
export const maxDuration = 300;

/**
 * Bearer-authed drain for deferred ESI refresh jobs. Unscheduled on Hobby
 * (sub-daily Vercel crons are rejected); invoke with
 * `Authorization: Bearer ${CRON_SECRET}`. The shared declaration shell owns
 * its Redis-only idle probe, authentication, advisory lock, work, and
 * noteworthy telemetry. No user input; body and query parameters are ignored.
 */
// authz: cron
// input: none
export const GET = defineCronRoute<EsiRefreshWorkerSummary>(
  drainEsiRefreshJobsDeclaration,
);
