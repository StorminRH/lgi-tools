import type { EsiRefreshWorkerSummary } from '@/data/esi-refresh-jobs/api-contract';
import { defineCronRoute } from '@/db/cron-gate';
import { drainEsiRefreshJobsDeclaration } from './declaration';

/** Maximum Vercel function execution window in seconds for this route's bounded background work. */
export const maxDuration = 300;

/**
 * Vercel cron, scheduled every 15 minutes. The shared declaration shell owns
 * its Redis-only idle probe, authentication, advisory lock, work, and
 * noteworthy telemetry. No user input; body and query parameters are ignored.
 */
// authz: cron
export const GET = defineCronRoute<EsiRefreshWorkerSummary>(
  drainEsiRefreshJobsDeclaration,
);
