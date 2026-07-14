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
  recoverStaleRunningJobs,
} from '@/data/esi-refresh-jobs/queries';
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
): Promise<'failed_retryable' | 'dead_lettered'> {
  const attemptCount = job.attemptCount + 1;
  if (attemptCount < ESI_REFRESH_JOB_MAX_ATTEMPTS) {
    await markEsiRefreshJobRetryable(job.id, attemptCount, code, retryAt(attemptCount, now), now);
    return 'failed_retryable';
  }

  await markEsiRefreshJobDeadLettered(job.id, attemptCount, code, now);
  await swallow(
    '[esi-refresh-worker] dead-letter alert failed',
    alertEsiRefreshDeadLetter({
      jobId: job.id,
      dataset: job.dataset,
      resource: job.resource,
      attemptCount,
      failureCode: code,
    }),
  );
  return 'dead_lettered';
}

async function processJob(
  job: EsiRefreshJob,
  now: Date,
): Promise<'succeeded' | 'deferred_for_budget' | 'failed_retryable' | 'failed_permanent' | 'dead_lettered'> {
  let result: OwnerSyncResult;
  try {
    result = await RUNNERS[job.dataset](job.userId, targetOf(job));
  } catch (error) {
    return recordRetryableFailure(job, retryCode(error), now);
  }

  switch (result.kind) {
    case 'succeeded':
      await markEsiRefreshJobSucceeded(job.id, now);
      return 'succeeded';
    case 'deferred_for_budget':
      await markEsiRefreshJobDeferred(job.id, result.error, now);
      return 'deferred_for_budget';
    case 'failed_retryable':
      return recordRetryableFailure(job, result.code, now);
    case 'failed_permanent':
      await markEsiRefreshJobPermanent(job.id, result.code, now);
      return 'failed_permanent';
  }
}

export async function drainEsiRefreshJobs(
  now = new Date(),
): Promise<Omit<EsiRefreshWorkerSummary, 'status' | 'durationMs'>> {
  const recovered = await recoverStaleRunningJobs(
    new Date(now.getTime() - ESI_REFRESH_STALE_RUNNING_MS),
    now,
  );
  const jobs = await claimDueEsiRefreshJobs(ESI_REFRESH_JOB_BATCH_SIZE, now);
  const counts = {
    claimed: jobs.length,
    succeeded: 0,
    deferredForBudget: 0,
    failedRetryable: 0,
    failedPermanent: 0,
    deadLettered: 0,
    recovered,
  };

  for (const job of jobs) {
    const outcome = await processJob(job, now);
    if (outcome === 'succeeded') counts.succeeded += 1;
    if (outcome === 'deferred_for_budget') counts.deferredForBudget += 1;
    if (outcome === 'failed_retryable') counts.failedRetryable += 1;
    if (outcome === 'failed_permanent') counts.failedPermanent += 1;
    if (outcome === 'dead_lettered') counts.deadLettered += 1;
  }

  return counts;
}
