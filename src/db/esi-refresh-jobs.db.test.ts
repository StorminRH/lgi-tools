import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  enqueueEsiRefreshJob,
  getEsiRefreshQueueResidual,
  getEsiRefreshQueueStats,
  pruneEsiRefreshJobs,
  recoverStaleRunningJobs,
  requeueDeadLetteredJob,
} from '@/data/esi-refresh-jobs/queries';
import { esiRefreshJobs } from '@/data/esi-refresh-jobs/schema';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { createDbTestHarness } from './test-support/db-test-harness';

const harness = await createDbTestHarness({
  schema: 'test_esi_refresh_jobs',
  tables: ['esi_refresh_jobs'],
  steerDbProxy: true,
});
const NOW = new Date('2026-07-14T12:00:00Z');
const OLD = new Date('2026-07-01T12:00:00Z');
const BOUNDARY = new Date('2026-07-07T12:00:00Z');

describe.skipIf(!harness.reachable)('ESI refresh queue durability executes against Postgres', () => {
  it('coalesces concurrent budget deferrals for the same dataset and owner', async () => {
    const database = harness.db;
    const error = new EsiBudgetExhaustedError(
      10,
      'rate_limited',
      900,
      '/characters/1001/skills/',
    );
    const input = {
      dataset: 'skills' as const,
      userId: 'user-1',
      target: { ownerType: 'character' as const, ownerId: 1001 },
      error,
    };

    const ids = await Promise.all([
      enqueueEsiRefreshJob(input, NOW, database),
      enqueueEsiRefreshJob(input, NOW, database),
    ]);
    const rows = await database.select().from(esiRefreshJobs);

    expect(ids[0]).toBe(ids[1]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dataset: 'skills',
      ownerType: 'character',
      ownerId: 1001,
      status: 'deferred_for_budget',
      nextAttemptAt: new Date('2026-07-14T12:15:00Z'),
    });
  });

  it('prunes expired terminal rows while preserving the boundary and dead letters', async () => {
    const database = harness.db;
    await database.delete(esiRefreshJobs);
    await database.insert(esiRefreshJobs).values([
      terminalJob('old-success', 'succeeded', OLD),
      terminalJob('boundary-success', 'succeeded', BOUNDARY),
      terminalJob('old-permanent', 'failed_permanent', OLD),
      terminalJob('old-dead-letter', 'dead_lettered', OLD),
    ]);

    await pruneEsiRefreshJobs(database, 7, NOW);

    const remaining = await database
      .select({ key: esiRefreshJobs.idempotencyKey })
      .from(esiRefreshJobs)
      .orderBy(asc(esiRefreshJobs.idempotencyKey));
    expect(remaining).toEqual([
      { key: 'boundary-success' },
      { key: 'old-dead-letter' },
    ]);
  });

  it('keeps a dead letter superseded when its idempotency key already has a live job', async () => {
    const database = harness.db;
    await database.delete(esiRefreshJobs);
    const [deadLetter] = await database
      .insert(esiRefreshJobs)
      .values([
        terminalJob('same-key', 'dead_lettered', OLD),
        {
          ...terminalJob('same-key', 'succeeded', NOW),
          status: 'queued' as const,
          finishedAt: null,
        },
      ])
      .returning({ id: esiRefreshJobs.id });
    if (!deadLetter) throw new Error('expected the dead-letter fixture');

    const result = await requeueDeadLetteredJob(deadLetter.id, NOW);
    const rows = await database
      .select({ status: esiRefreshJobs.status, attemptCount: esiRefreshJobs.attemptCount })
      .from(esiRefreshJobs)
      .orderBy(asc(esiRefreshJobs.status));

    expect(result).toEqual({ outcome: 'superseded' });
    expect(rows).toEqual([
      { status: 'queued', attemptCount: 0 },
      { status: 'dead_lettered', attemptCount: 0 },
    ]);
  });

  it('decodes the grouped oldest-created aggregate as a Date', async () => {
    const database = harness.db;
    await database.delete(esiRefreshJobs);
    await database.insert(esiRefreshJobs).values([
      {
        ...terminalJob('older-queued', 'succeeded', OLD),
        status: 'queued',
        finishedAt: null,
      },
      {
        ...terminalJob('newer-queued', 'succeeded', NOW),
        status: 'queued',
        finishedAt: null,
      },
    ]);

    const rows = await getEsiRefreshQueueStats();

    expect(rows).toEqual([{ status: 'queued', count: 2, oldestCreatedAt: OLD }]);
    expect(rows[0]?.oldestCreatedAt).toBeInstanceOf(Date);
  });

  it('returns due count and earliest retry across only live jobs', async () => {
    const database = harness.db;
    const earlier = new Date('2026-07-14T11:45:00Z');
    const later = new Date('2026-07-14T13:00:00Z');
    await database.delete(esiRefreshJobs);
    await database.insert(esiRefreshJobs).values([
      {
        ...terminalJob('due-live', 'succeeded', earlier),
        status: 'queued',
        finishedAt: null,
      },
      {
        ...terminalJob('future-live', 'succeeded', later),
        status: 'deferred_for_budget',
        finishedAt: null,
      },
      terminalJob('terminal', 'succeeded', earlier),
    ]);

    await expect(getEsiRefreshQueueResidual(NOW, database)).resolves.toEqual({
      dueCount: 1,
      earliestNextAttemptAt: earlier,
    });

    await database
      .delete(esiRefreshJobs)
      .where(eq(esiRefreshJobs.status, 'queued'));
    await database
      .delete(esiRefreshJobs)
      .where(eq(esiRefreshJobs.status, 'deferred_for_budget'));
    await expect(getEsiRefreshQueueResidual(NOW, database)).resolves.toEqual({
      dueCount: 0,
      earliestNextAttemptAt: null,
    });
  });

  it('requeues a dead letter with every retry field reset', async () => {
    const database = harness.db;
    await database.delete(esiRefreshJobs);
    const [deadLetter] = await database
      .insert(esiRefreshJobs)
      .values({
        ...terminalJob('retry-me', 'dead_lettered', OLD),
        attemptCount: 5,
        budgetReason: 'rate_limited',
        budgetRemaining: 3,
        retryAfterSeconds: 900,
        lastErrorCode: 'provider_5xx',
      })
      .returning({ id: esiRefreshJobs.id });
    if (!deadLetter) throw new Error('expected the retry fixture');

    await expect(requeueDeadLetteredJob(deadLetter.id, NOW)).resolves.toEqual({
      outcome: 'requeued',
    });
    const [row] = await database.select().from(esiRefreshJobs);
    expect(row).toMatchObject({
      status: 'queued',
      attemptCount: 0,
      nextAttemptAt: NOW,
      budgetReason: null,
      budgetRemaining: null,
      retryAfterSeconds: null,
      lastErrorCode: null,
      updatedAt: NOW,
      finishedAt: null,
    });
  });

  it('counts interrupted runs and dead-letters the fifth interruption', async () => {
    const database = harness.db;
    await database.delete(esiRefreshJobs);
    await database.insert(esiRefreshJobs).values([
      runningJob('retry-interrupted', 2, new Date('2026-07-14T11:00:00Z')),
      runningJob('dead-interrupted', 4, new Date('2026-07-14T11:00:00Z')),
      runningJob('still-running', 4, new Date('2026-07-14T11:55:00Z')),
    ]);

    const result = await recoverStaleRunningJobs(
      new Date('2026-07-14T11:50:00Z'),
      NOW,
      database,
    );
    const rows = await database
      .select({
        key: esiRefreshJobs.idempotencyKey,
        status: esiRefreshJobs.status,
        attemptCount: esiRefreshJobs.attemptCount,
      })
      .from(esiRefreshJobs)
      .orderBy(asc(esiRefreshJobs.idempotencyKey));

    expect(result.recovered).toBe(2);
    expect(result.retryable).toHaveLength(1);
    expect(result.retryable[0]).toMatchObject({
      idempotencyKey: 'retry-interrupted',
      status: 'failed_retryable',
      attemptCount: 3,
      lastErrorCode: 'worker_interrupted',
    });
    expect(result.deadLettered).toHaveLength(1);
    expect(result.deadLettered[0]).toMatchObject({
      idempotencyKey: 'dead-interrupted',
      status: 'dead_lettered',
      attemptCount: 5,
      lastErrorCode: 'worker_interrupted',
    });
    expect(rows).toEqual([
      { key: 'dead-interrupted', status: 'dead_lettered', attemptCount: 5 },
      { key: 'retry-interrupted', status: 'failed_retryable', attemptCount: 3 },
      { key: 'still-running', status: 'running', attemptCount: 4 },
    ]);
  });
});

function terminalJob(
  idempotencyKey: string,
  status: 'succeeded' | 'failed_permanent' | 'dead_lettered',
  finishedAt: Date,
) {
  return {
    dataset: 'owned_assets' as const,
    userId: 'user-1',
    ownerType: 'character' as const,
    ownerId: 1001,
    resource: '/characters/1001/assets/',
    idempotencyKey,
    status,
    nextAttemptAt: finishedAt,
    createdAt: finishedAt,
    updatedAt: finishedAt,
    finishedAt,
  };
}

function runningJob(idempotencyKey: string, attemptCount: number, updatedAt: Date) {
  return {
    dataset: 'owned_blueprints' as const,
    userId: 'user-1',
    ownerType: 'character' as const,
    ownerId: 1001,
    resource: '/characters/1001/blueprints/',
    idempotencyKey,
    status: 'running' as const,
    attemptCount,
    nextAttemptAt: updatedAt,
    createdAt: updatedAt,
    updatedAt,
  };
}
