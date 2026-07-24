import type { EsiRefreshWorkerSummary } from '@/data/esi-refresh-jobs/api-contract';
import { ADVISORY_LOCK_ESI_REFRESH_QUEUE } from '@/data/esi-refresh-jobs/constants';
import { readPendingWorkSignal } from '@/data/esi-refresh-jobs/pending-signal';
import type { CronRouteDeclaration } from '@/db/cron-gate';
import { drainEsiRefreshJobs } from '@/db/esi-refresh-worker';
import { swallow } from '@/transport/cron';
import { hasRecentBudgetExhaustion } from '@/platform/esi/exhaustion-marker';
import { maybeAlertPublicEsiBudgetExhaustion } from './public-budget-alert';

function zeroSummary(
  reason: 'busy' | 'idle',
  durationMs: number,
): EsiRefreshWorkerSummary {
  return {
    status: 'skipped',
    reason,
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

/**
 * Returns true during the 12:00–12:14 UTC drain slot. That one daily run
 * reaches Neon regardless of Redis hints so lost signal state can delay
 * durable queue work by no more than about 24 hours.
 */
export function isDailyHealWindow(now: Date): boolean {
  return now.getUTCHours() === 12 && now.getUTCMinutes() < 15;
}

/**
 * Declares the deferred ESI drain as an idle-silent, lock-guarded route. Its
 * Redis-only probe runs before any Neon access; due work, recent budget
 * exhaustion, unknown Redis state, and the daily heal slot all proceed.
 */
export const drainEsiRefreshJobsDeclaration: CronRouteDeclaration<EsiRefreshWorkerSummary> = {
  name: 'cron:esi-refresh-jobs',
  action: 'cron_esi_refresh_jobs',
  wakeClass: 'idle-silent',
  record: { policy: 'noteworthy' },
  lock: {
    key: Number(ADVISORY_LOCK_ESI_REFRESH_QUEUE),
    busyBody: (durationMs) => zeroSummary('busy', durationMs),
  },
  idle: {
    probe: async () => {
      const now = new Date();
      if (isDailyHealWindow(now)) return { idle: false };

      const recentExhaustion = await hasRecentBudgetExhaustion();
      if (recentExhaustion !== false) return { idle: false };

      const pendingWork = await readPendingWorkSignal(now);
      if (pendingWork !== 'idle') return { idle: false };
      return {
        idle: true,
        telemetry: {
          pendingWork,
          recentExhaustion,
        },
      };
    },
    body: (durationMs) => zeroSummary('idle', durationMs),
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
