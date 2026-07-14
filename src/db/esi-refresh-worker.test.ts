import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiRefreshJob } from '@/data/esi-refresh-jobs/types';
import { EsiBudgetExhaustedError } from '@/lib/esi';

const mocks = vi.hoisted(() => ({
  alertDeadLetter: vi.fn(async () => {}),
  claim: vi.fn(),
  markDeadLettered: vi.fn(async () => {}),
  markDeferred: vi.fn(async () => {}),
  markPermanent: vi.fn(async () => {}),
  markRetryable: vi.fn(async () => {}),
  markSucceeded: vi.fn(async () => {}),
  recover: vi.fn(async () => 0),
  runAssets: vi.fn(),
  runBlueprints: vi.fn(),
  runCharacterJobs: vi.fn(),
  runCorporationJobs: vi.fn(),
  runSkills: vi.fn(),
}));

vi.mock('@/data/esi-refresh-jobs/queries', () => ({
  claimDueEsiRefreshJobs: mocks.claim,
  markEsiRefreshJobDeadLettered: mocks.markDeadLettered,
  markEsiRefreshJobDeferred: mocks.markDeferred,
  markEsiRefreshJobPermanent: mocks.markPermanent,
  markEsiRefreshJobRetryable: mocks.markRetryable,
  markEsiRefreshJobSucceeded: mocks.markSucceeded,
  recoverStaleRunningJobs: mocks.recover,
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
    mocks.recover.mockResolvedValue(2);
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

    const result = await drainEsiRefreshJobs(NOW);

    expect(result).toEqual({
      claimed: 5,
      succeeded: 1,
      deferredForBudget: 1,
      failedRetryable: 1,
      failedPermanent: 1,
      deadLettered: 1,
      recovered: 2,
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
  });
});
