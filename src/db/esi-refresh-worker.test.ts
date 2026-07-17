import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiRefreshJob } from '@/data/esi-refresh-jobs/types';
import { EsiBudgetExhaustedError } from '@/lib/esi';

const mocks = vi.hoisted(() => ({
  alertDeadLetter: vi.fn(async () => {}),
  claim: vi.fn(),
  residual: vi.fn<
    () => Promise<{
      dueCount: number;
      earliestNextAttemptAt: Date | null;
    }>
  >(async () => ({
    dueCount: 0,
    earliestNextAttemptAt: null,
  })),
  markDeadLettered: vi.fn(async () => {}),
  markDeferred: vi.fn(async () => {}),
  markPermanent: vi.fn(async () => {}),
  markRetryable: vi.fn(async () => {}),
  markSucceeded: vi.fn(async () => {}),
  recover: vi.fn<
    () => Promise<{
      recovered: number;
      retryable: EsiRefreshJob[];
      deadLettered: EsiRefreshJob[];
    }>
  >(async () => ({ recovered: 0, retryable: [], deadLettered: [] })),
  emitDomainEvent: vi.fn(),
  runAssets: vi.fn(),
  runBlueprints: vi.fn(),
  runCharacterJobs: vi.fn(),
  runCorporationJobs: vi.fn(),
  runSkills: vi.fn(),
  writeBackPendingWorkSignal: vi.fn(async () => {}),
}));
vi.mock('@/data/domain-events/queries', () => ({
  emitDomainEvent: mocks.emitDomainEvent,
}));

vi.mock('@/data/esi-refresh-jobs/queries', () => ({
  claimDueEsiRefreshJobs: mocks.claim,
  getEsiRefreshQueueResidual: mocks.residual,
  markEsiRefreshJobDeadLettered: mocks.markDeadLettered,
  markEsiRefreshJobDeferred: mocks.markDeferred,
  markEsiRefreshJobPermanent: mocks.markPermanent,
  markEsiRefreshJobRetryable: mocks.markRetryable,
  markEsiRefreshJobSucceeded: mocks.markSucceeded,
  recoverStaleRunningJobs: mocks.recover,
}));
vi.mock('@/data/esi-refresh-jobs/pending-signal', () => ({
  writeBackPendingWorkSignal: mocks.writeBackPendingWorkSignal,
}));
vi.mock('@/lib/alerts', () => ({ alertEsiRefreshDeadLetter: mocks.alertDeadLetter }));
vi.mock('./corp-industry-jobs-sync', () => ({
  runCorporationIndustryJobsRefreshJob: mocks.runCorporationJobs,
}));
vi.mock('./industry-jobs-sync', () => ({
  runCharacterIndustryJobsRefreshJob: mocks.runCharacterJobs,
}));
vi.mock('./owned-assets-sync', () => ({ runOwnedAssetsRefreshJob: mocks.runAssets }));
vi.mock('./owned-blueprints-sync', () => ({
  runOwnedBlueprintsRefreshJob: mocks.runBlueprints,
}));
vi.mock('./skills-sync', () => ({ runSkillsRefreshJob: mocks.runSkills }));

import { drainEsiRefreshJobs } from './esi-refresh-worker';

const NOW = new Date('2026-07-14T12:00:00Z');

function job(
  id: number,
  dataset: EsiRefreshJob['dataset'],
  attemptCount = 0,
): EsiRefreshJob {
  return {
    id,
    dataset,
    userId: 'user-1',
    ownerType: dataset === 'corporation_industry_jobs' ? 'corporation' : 'character',
    ownerId: dataset === 'corporation_industry_jobs' ? 9001 : 1001,
    resource: `/esi/${dataset}`,
    idempotencyKey: `key-${id}`,
    status: 'running',
    attemptCount,
    nextAttemptAt: NOW,
    budgetReason: null,
    budgetRemaining: null,
    retryAfterSeconds: null,
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    finishedAt: null,
  };
}

describe('drainEsiRefreshJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recover.mockResolvedValue({ recovered: 0, retryable: [], deadLettered: [] });
    mocks.residual.mockResolvedValue({
      dueCount: 0,
      earliestNextAttemptAt: null,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('processes each dataset serially and records every lifecycle outcome', async () => {
    const jobs = [
      job(1, 'skills'),
      job(2, 'character_industry_jobs'),
      job(3, 'corporation_industry_jobs'),
      job(4, 'owned_blueprints'),
      job(5, 'owned_assets', 4),
    ];
    const budgetError = new EsiBudgetExhaustedError(
      12,
      'rate_limited',
      900,
      '/characters/1001/jobs/',
    );
    mocks.claim.mockResolvedValue(jobs);
    mocks.runSkills.mockResolvedValue({
      kind: 'succeeded',
      target: { ownerType: 'character', ownerId: 1001 },
    });
    mocks.runCharacterJobs.mockResolvedValue({
      kind: 'deferred_for_budget',
      target: { ownerType: 'character', ownerId: 1001 },
      error: budgetError,
    });
    mocks.runCorporationJobs.mockResolvedValue({
      kind: 'failed_retryable',
      target: { ownerType: 'corporation', ownerId: 9001 },
      code: 'esi_server_error',
    });
    mocks.runBlueprints.mockResolvedValue({
      kind: 'failed_permanent',
      target: { ownerType: 'character', ownerId: 1001 },
      code: 'scope_missing',
    });
    mocks.runAssets.mockRejectedValue(new TypeError('connection lost'));
    const earliestNextAttemptAt = new Date('2026-07-14T12:15:00Z');
    mocks.residual.mockResolvedValue({
      dueCount: 2,
      earliestNextAttemptAt,
    });

    const result = await drainEsiRefreshJobs(NOW);

    expect(result).toEqual({
      claimed: 5,
      succeeded: 1,
      deferredForBudget: 1,
      failedRetryable: 1,
      failedPermanent: 1,
      deadLettered: 1,
      recovered: 0,
    });
    expect(mocks.markSucceeded).toHaveBeenCalledWith(1, NOW);
    expect(mocks.markDeferred).toHaveBeenCalledWith(2, budgetError, NOW);
    expect(mocks.markRetryable).toHaveBeenCalledWith(
      3,
      1,
      'esi_server_error',
      new Date('2026-07-14T12:15:00Z'),
      NOW,
    );
    expect(mocks.markPermanent).toHaveBeenCalledWith(4, 'scope_missing', NOW);
    expect(mocks.markDeadLettered).toHaveBeenCalledWith(5, 5, 'connection', NOW);
    expect(mocks.alertDeadLetter).toHaveBeenCalledWith({
      jobId: 5,
      dataset: 'owned_assets',
      resource: '/esi/owned_assets',
      attemptCount: 5,
      failureCode: 'connection',
    });
    expect(mocks.residual).toHaveBeenCalledWith(NOW);
    expect(mocks.writeBackPendingWorkSignal).toHaveBeenCalledWith(
      earliestNextAttemptAt,
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"dueCount":2'),
    );
    expect(mocks.emitDomainEvent.mock.calls.map(([event]) => event)).toEqual([
      {
        eventType: 'esi_refresh_job_status_changed',
        metadata: {
          jobId: 1,
          dataset: 'skills',
          ownerType: 'character',
          ownerId: 1001,
          status: 'succeeded',
          attemptCount: 0,
          failureCode: null,
        },
      },
      {
        eventType: 'esi_refresh_job_status_changed',
        metadata: {
          jobId: 3,
          dataset: 'corporation_industry_jobs',
          ownerType: 'corporation',
          ownerId: 9001,
          status: 'failed_retryable',
          attemptCount: 1,
          failureCode: 'esi_server_error',
        },
      },
      {
        eventType: 'esi_refresh_job_status_changed',
        metadata: {
          jobId: 4,
          dataset: 'owned_blueprints',
          ownerType: 'character',
          ownerId: 1001,
          status: 'failed_permanent',
          attemptCount: 0,
          failureCode: 'scope_missing',
        },
      },
      {
        eventType: 'esi_refresh_job_status_changed',
        metadata: {
          jobId: 5,
          dataset: 'owned_assets',
          ownerType: 'character',
          ownerId: 1001,
          status: 'dead_lettered',
          attemptCount: 5,
          failureCode: 'connection',
        },
      },
    ]);
  });

  it('alerts recovered dead letters and continues after one outcome write fails', async () => {
    const interrupted = job(8, 'owned_blueprints', 5);
    const retryable = { ...job(7, 'skills', 3), status: 'failed_retryable' as const };
    mocks.recover.mockResolvedValue({
      recovered: 2,
      retryable: [retryable],
      deadLettered: [interrupted],
    });
    mocks.claim.mockResolvedValue([job(9, 'skills'), job(10, 'skills')]);
    mocks.runSkills.mockResolvedValue({
      kind: 'succeeded',
      target: { ownerType: 'character', ownerId: 1001 },
    });
    mocks.markSucceeded
      .mockRejectedValueOnce(new Error('database write failed'))
      .mockResolvedValueOnce(undefined);

    const result = await drainEsiRefreshJobs(NOW);

    expect(result).toMatchObject({
      claimed: 2,
      succeeded: 1,
      deadLettered: 1,
      recovered: 2,
    });
    expect(mocks.markSucceeded).toHaveBeenCalledTimes(2);
    expect(mocks.writeBackPendingWorkSignal).toHaveBeenCalledWith(null);
    expect(mocks.alertDeadLetter).toHaveBeenCalledWith({
      jobId: 8,
      dataset: 'owned_blueprints',
      resource: '/esi/owned_blueprints',
      attemptCount: 5,
      failureCode: 'worker_interrupted',
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"jobId":9'),
    );
    expect(mocks.emitDomainEvent).toHaveBeenCalledWith({
      eventType: 'esi_refresh_job_status_changed',
      metadata: {
        jobId: 7,
        dataset: 'skills',
        ownerType: 'character',
        ownerId: 1001,
        status: 'failed_retryable',
        attemptCount: 3,
        failureCode: 'worker_interrupted',
      },
    });
    expect(mocks.emitDomainEvent).toHaveBeenCalledWith({
      eventType: 'esi_refresh_job_status_changed',
      metadata: {
        jobId: 8,
        dataset: 'owned_blueprints',
        ownerType: 'character',
        ownerId: 1001,
        status: 'dead_lettered',
        attemptCount: 5,
        failureCode: 'worker_interrupted',
      },
    });
  });
});
