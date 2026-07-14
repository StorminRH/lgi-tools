import { ADVISORY_LOCK_ESI_REFRESH_QUEUE } from '@/data/esi-refresh-jobs/constants';
import type { EsiRefreshWorkerSummary } from '@/data/esi-refresh-jobs/api-contract';
import { runCronJob } from '@/db/cron-gate';
import { drainEsiRefreshJobs } from '@/db/esi-refresh-worker';

export const maxDuration = 300;

// Vercel cron, scheduled every 15 minutes. The shared cron gate authenticates
// CRON_SECRET and holds the session advisory lock so duplicate delivery cannot
// claim the same jobs. No user input; body and query parameters are ignored.
// authz: cron
export async function GET(req: Request): Promise<Response> {
  const started = Date.now();
  return runCronJob({
    req,
    lockKey: Number(ADVISORY_LOCK_ESI_REFRESH_QUEUE),
    onBusy: () =>
      Response.json({
        status: 'skipped',
        reason: 'busy',
        claimed: 0,
        succeeded: 0,
        deferredForBudget: 0,
        failedRetryable: 0,
        failedPermanent: 0,
        deadLettered: 0,
        recovered: 0,
        durationMs: Date.now() - started,
      } satisfies EsiRefreshWorkerSummary),
    work: async () => {
      const counts = await drainEsiRefreshJobs();
      const summary = {
        status: 'drained',
        ...counts,
        durationMs: Date.now() - started,
      } satisfies EsiRefreshWorkerSummary;
      console.log(JSON.stringify({ scope: 'cron:esi-refresh-jobs', ...summary }));
      return Response.json(summary);
    },
  });
}
