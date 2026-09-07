import type { EsiRefreshWorkerSummary } from '@/data/esi-refresh-jobs/api-contract';
import { ADVISORY_LOCK_ESI_REFRESH_QUEUE } from '@/data/esi-refresh-jobs/constants';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { drainEsiRefreshJobs } from '@/composition/sync/esi-refresh-worker';
import { swallow } from '@/transport/cron';
import { maybeAlertPublicEsiBudgetExhaustion } from './public-budget-alert';

function busySummary(durationMs: number): EsiRefreshWorkerSummary {
  return {
    status: 'skipped',
    reason: 'busy',
    claimed: 0,
    succeeded: 0,
    deferredForBudget: 0,
    failedRetryable: 0,
    failedPermanent: 0,
    deadLettered: 0,
    recovered: 0,
    durationMs,
  };
}

export const drainEsiRefreshJobsDeclaration: CronRouteDeclaration<EsiRefreshWorkerSummary> = {
  name: 'cron:esi-refresh-jobs',
  action: 'cron_esi_refresh_jobs',
  capability: 'cron.drain-esi-refresh-jobs',
  wakeClass: 'batch',
  record: { policy: 'noteworthy' },
  lock: {
    key: Number(ADVISORY_LOCK_ESI_REFRESH_QUEUE),
    busyBody: (durationMs) => busySummary(durationMs),
  },
  work: async () => {
    const started = Date.now();
    await swallow(
      '[cron:esi-refresh-jobs] public ESI budget alert failed',
      maybeAlertPublicEsiBudgetExhaustion(),
    );
    const counts = await drainEsiRefreshJobs();
    return {
      outcome: 'drained',
      workDone: counts.claimed > 0 || counts.recovered > 0,
      telemetry: counts,
      body: {
        status: 'drained',
        ...counts,
        durationMs: Date.now() - started,
      },
    };
  },
};
