import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EsiRefreshJob } from '@/data/esi-refresh-jobs/types';
import { EsiBudgetExhaustedError } from '@/platform/esi';

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
  logUsageEvent: vi.fn<(input: { action: string; metadata: Record<string, unknown> }) => Promise<void>>(
    async () => {},
  ),
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

// Observe the capability row the runner schedules: `after` runs inline and the
// telemetry writer is the same `logUsageEvent` owner the rest of the app uses.
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: mocks.logUsageEvent }));
vi.mock('next/server', () => ({
  connection: async () => {},
  after: (fn: () => unknown) => fn(),
}));

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

describe('queued-job capability recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recover.mockResolvedValue({ recovered: 0, retryable: [], deadLettered: [] });
    mocks.residual.mockResolvedValue({ dueCount: 0, earliestNextAttemptAt: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  function capabilityRows() {
    return mocks.logUsageEvent.mock.calls
      .map(([input]) => input)
      .filter((input) => input.action === 'capability_outcome');
  }

  it('records a budget-deferred job as rate limited', async () => {
    mocks.claim.mockResolvedValue([job(1, 'skills')]);
    mocks.runSkills.mockResolvedValue({
      kind: 'deferred_for_budget',
      error: new EsiBudgetExhaustedError(12, 'rate_limited', 900),
    });

    await drainEsiRefreshJobs();

    const rows = capabilityRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({
      feature: 'sync',
      operation: 'process-esi-refresh-job',
      outcome: 'rate_limited',
      code: 'deferred_for_budget',
      retry: { attempt: 0, maxAttempts: 5, rateLimited: true },
    });
  });

  it('records a final-attempt failure at the declared attempt ceiling', async () => {
    // attemptCount 4 → this run is attempt 5, the dead-letter boundary.
    mocks.claim.mockResolvedValue([job(1, 'skills', 4)]);
    mocks.runSkills.mockResolvedValue({ kind: 'failed_retryable', code: 'timeout' });

    await drainEsiRefreshJobs();

    const rows = capabilityRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({
      outcome: 'dependency_unavailable',
      code: 'timeout',
      retry: { attempt: 5, maxAttempts: 5, rateLimited: false },
    });
  });

  it('records a successful job once, as succeeded', async () => {
    mocks.claim.mockResolvedValue([job(1, 'skills')]);
    mocks.runSkills.mockResolvedValue({ kind: 'succeeded' });

    await drainEsiRefreshJobs();

    const rows = capabilityRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({ outcome: 'succeeded', code: 'ok' });
    expect(rows[0]?.metadata.durationMs).toEqual(expect.any(Number));
  });

  it('gives each job in one drain its own correlation id', async () => {
    mocks.claim.mockResolvedValue([job(1, 'skills'), job(2, 'owned_assets')]);
    mocks.runSkills.mockResolvedValue({ kind: 'succeeded' });
    mocks.runAssets.mockResolvedValue({ kind: 'succeeded' });

    await drainEsiRefreshJobs();

    const ids = capabilityRows().map((row) => row.metadata.correlationId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('records a thrown job before the drain swallows it', async () => {
    // The drain isolates a failing job by catching. Without a record here the
    // capability stream would be empty during exactly the outage — Neon
    // unavailable while marking status — that the job indicator exists to show.
    mocks.claim.mockResolvedValue([job(1, 'skills')]);
    mocks.runSkills.mockResolvedValue({ kind: 'succeeded' });
    mocks.markSucceeded.mockRejectedValueOnce(new Error('neon unavailable'));

    await drainEsiRefreshJobs();

    const rows = capabilityRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({
      feature: 'sync',
      operation: 'process-esi-refresh-job',
      outcome: 'unexpected',
      code: 'unexpected',
      retry: { attempt: 1, maxAttempts: 5, rateLimited: false },
    });
  });

  it('still isolates the thrown job from the rest of the drain', async () => {
    mocks.claim.mockResolvedValue([job(1, 'skills'), job(2, 'owned_assets')]);
    mocks.runSkills.mockResolvedValue({ kind: 'succeeded' });
    mocks.runAssets.mockResolvedValue({ kind: 'succeeded' });
    mocks.markSucceeded.mockRejectedValueOnce(new Error('neon unavailable'));

    const summary = await drainEsiRefreshJobs();

    // The second job still ran and its row still landed; recording the throw
    // must not change the drain's own error isolation.
    expect(summary.succeeded).toBe(1);
    expect(capabilityRows()).toHaveLength(2);
  });
});
