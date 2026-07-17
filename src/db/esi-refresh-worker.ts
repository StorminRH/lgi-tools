import {
  ESI_REFRESH_JOB_BATCH_SIZE,
  ESI_REFRESH_JOB_MAX_ATTEMPTS,
  ESI_REFRESH_RETRY_DELAYS_MS,
  ESI_REFRESH_STALE_RUNNING_MS,
} from '@/data/esi-refresh-jobs/constants';
import {
  claimDueEsiRefreshJobs,
  markEsiRefreshJobDeadLettered,
  markEsiRefreshJobDeferred,
  markEsiRefreshJobPermanent,
  markEsiRefreshJobRetryable,
  markEsiRefreshJobSucceeded,
  getEsiRefreshQueueResidual,
  recoverStaleRunningJobs,
} from '@/data/esi-refresh-jobs/queries';
import { writeBackPendingWorkSignal } from '@/data/esi-refresh-jobs/pending-signal';
import { emitDomainEvent } from '@/data/domain-events/queries';
import type { EsiRefreshWorkerSummary } from '@/data/esi-refresh-jobs/api-contract';
import type {
  EsiRefreshDataset,
  EsiRefreshJob,
} from '@/data/esi-refresh-jobs/types';
import { alertEsiRefreshDeadLetter } from '@/lib/alerts';
import { swallow } from '@/lib/cron';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/lib/owner-sync';
import { runCorporationIndustryJobsRefreshJob } from './corp-industry-jobs-sync';
import { runCharacterIndustryJobsRefreshJob } from './industry-jobs-sync';
import { runOwnedAssetsRefreshJob } from './owned-assets-sync';
import { runOwnedBlueprintsRefreshJob } from './owned-blueprints-sync';
import { runSkillsRefreshJob } from './skills-sync';

type RefreshJobRunner = (
  userId: string,
  target: OwnerSyncTarget,
) => Promise<OwnerSyncResult>;

type RecordedJobStatus =
  | 'succeeded'
  | 'failed_retryable'
  | 'failed_permanent'
  | 'dead_lettered';

type ProcessJobOutcome =
  | {
      status: RecordedJobStatus;
      attemptCount: number;
      failureCode: string | null;
    }
  | { status: 'deferred_for_budget' };

type EsiRefreshWorkerCounts = Omit<EsiRefreshWorkerSummary, 'status' | 'durationMs'>;

const RUNNERS: Record<EsiRefreshDataset, RefreshJobRunner> = {
  skills: runSkillsRefreshJob,
  character_industry_jobs: runCharacterIndustryJobsRefreshJob,
  corporation_industry_jobs: runCorporationIndustryJobsRefreshJob,
  owned_blueprints: runOwnedBlueprintsRefreshJob,
  owned_assets: runOwnedAssetsRefreshJob,
};

function targetOf(job: EsiRefreshJob): OwnerSyncTarget {
  return { ownerType: job.ownerType, ownerId: job.ownerId };
}

function retryCode(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  if (error instanceof TypeError) return 'connection';
  if (error instanceof Error) return error.name || 'unexpected';
  return 'unexpected';
}

function retryAt(attemptCount: number, now: Date): Date {
  const fallbackDelay = 24 * 60 * 60 * 1000;
  const delay =
    ESI_REFRESH_RETRY_DELAYS_MS[
      Math.min(attemptCount - 1, ESI_REFRESH_RETRY_DELAYS_MS.length - 1)
    ] ?? fallbackDelay;
  return new Date(now.getTime() + delay);
}

async function recordRetryableFailure(
  job: EsiRefreshJob,
  code: string,
  now: Date,
): Promise<ProcessJobOutcome> {
  const attemptCount = job.attemptCount + 1;
  if (attemptCount < ESI_REFRESH_JOB_MAX_ATTEMPTS) {
    await markEsiRefreshJobRetryable(job.id, attemptCount, code, retryAt(attemptCount, now), now);
    return { status: 'failed_retryable', attemptCount, failureCode: code };
  }

  await markEsiRefreshJobDeadLettered(job.id, attemptCount, code, now);
  await alertDeadLetter(job, attemptCount, code);
  return { status: 'dead_lettered', attemptCount, failureCode: code };
}

async function alertDeadLetter(
  job: EsiRefreshJob,
  attemptCount: number,
  failureCode: string,
): Promise<void> {
  await swallow(
    '[esi-refresh-worker] dead-letter alert failed',
    alertEsiRefreshDeadLetter({
      jobId: job.id,
      dataset: job.dataset,
      resource: job.resource,
      attemptCount,
      failureCode,
    }),
  );
}

async function processJob(
  job: EsiRefreshJob,
  now: Date,
): Promise<ProcessJobOutcome> {
  let result: OwnerSyncResult;
  try {
    result = await RUNNERS[job.dataset](job.userId, targetOf(job));
  } catch (error) {
    return recordRetryableFailure(job, retryCode(error), now);
  }

  switch (result.kind) {
    case 'succeeded':
      await markEsiRefreshJobSucceeded(job.id, now);
      return { status: 'succeeded', attemptCount: job.attemptCount, failureCode: null };
    case 'deferred_for_budget':
      await markEsiRefreshJobDeferred(job.id, result.error, now);
      return { status: 'deferred_for_budget' };
    case 'failed_retryable':
      return recordRetryableFailure(job, result.code, now);
    case 'failed_permanent':
      await markEsiRefreshJobPermanent(job.id, result.code, now);
      return {
        status: 'failed_permanent',
        attemptCount: job.attemptCount,
        failureCode: result.code,
      };
  }
}

function emitJobStatus(
  job: EsiRefreshJob,
  status: RecordedJobStatus,
  attemptCount: number,
  failureCode: string | null,
): void {
  emitDomainEvent({
    eventType: 'esi_refresh_job_status_changed',
    metadata: {
      jobId: job.id,
      dataset: job.dataset,
      ownerType: job.ownerType,
      ownerId: job.ownerId,
      status,
      attemptCount,
      failureCode,
    },
  });
}

// One owner for the status-to-summary mapping and the rule that only persisted
// completion/failure transitions enter the ledger. Budget deferral stays live
// queue state, so it contributes to the drain summary but emits no finish event.
function recordProcessedOutcome(
  counts: EsiRefreshWorkerCounts,
  job: EsiRefreshJob,
  outcome: ProcessJobOutcome,
): void {
  switch (outcome.status) {
    case 'deferred_for_budget':
      counts.deferredForBudget += 1;
      return;
    case 'succeeded':
      counts.succeeded += 1;
      break;
    case 'failed_retryable':
      counts.failedRetryable += 1;
      break;
    case 'failed_permanent':
      counts.failedPermanent += 1;
      break;
    case 'dead_lettered':
      counts.deadLettered += 1;
      break;
  }
  emitJobStatus(job, outcome.status, outcome.attemptCount, outcome.failureCode);
}

/**
 * Claims and runs one bounded batch of deferred ESI refresh jobs with per-job isolation, retry
 * scheduling, dead-letter handling, and an aggregate drain summary.
 */
export async function drainEsiRefreshJobs(
  now = new Date(),
): Promise<Omit<EsiRefreshWorkerSummary, 'status' | 'durationMs'>> {
  const recovery = await recoverStaleRunningJobs(
    new Date(now.getTime() - ESI_REFRESH_STALE_RUNNING_MS),
    now,
  );
  for (const job of recovery.retryable) {
    emitJobStatus(job, 'failed_retryable', job.attemptCount, 'worker_interrupted');
  }
  for (const job of recovery.deadLettered) {
    emitJobStatus(job, 'dead_lettered', job.attemptCount, 'worker_interrupted');
  }
  await Promise.all(
    recovery.deadLettered.map((job) =>
      alertDeadLetter(job, job.attemptCount, 'worker_interrupted'),
    ),
  );
  const jobs = await claimDueEsiRefreshJobs(ESI_REFRESH_JOB_BATCH_SIZE, now);
  const counts = {
    claimed: jobs.length,
    succeeded: 0,
    deferredForBudget: 0,
    failedRetryable: 0,
    failedPermanent: 0,
    deadLettered: recovery.deadLettered.length,
    recovered: recovery.recovered,
  };

  for (const job of jobs) {
    try {
      const outcome = await processJob(job, now);
      recordProcessedOutcome(counts, job, outcome);
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: 'esi-refresh-worker:job',
          jobId: job.id,
          dataset: job.dataset,
          failure: retryCode(error),
        }),
      );
    }
  }

  const residual = await getEsiRefreshQueueResidual(now);
  await writeBackPendingWorkSignal(residual.earliestNextAttemptAt);
  console.log(
    JSON.stringify({
      scope: 'esi-refresh-worker:residual',
      dueCount: residual.dueCount,
      earliestNextAttemptAt: residual.earliestNextAttemptAt?.toISOString() ?? null,
    }),
  );
  return counts;
}
