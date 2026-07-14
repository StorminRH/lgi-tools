import { asc } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  enqueueEsiRefreshJob,
  pruneEsiRefreshJobs,
} from '@/data/esi-refresh-jobs/queries';
import { esiRefreshJobs } from '@/data/esi-refresh-jobs/schema';
import { EsiBudgetExhaustedError } from '@/lib/esi';
import {
  canReachDb,
  dropDisposableSchema,
  LOCAL_DB_URL,
  schemaUrl,
  setupDisposableSchema,
} from './test-support/db-coverage-harness';

const SCHEMA = 'test_esi_refresh_jobs';
const baseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const reachable = await canReachDb(baseUrl);
const NOW = new Date('2026-07-14T12:00:00Z');
const OLD = new Date('2026-07-01T12:00:00Z');
const BOUNDARY = new Date('2026-07-07T12:00:00Z');

describe.skipIf(!reachable)('ESI refresh queue durability executes against Postgres', () => {
  let client: ReturnType<typeof postgres>;

  beforeAll(async () => {
    client = postgres(schemaUrl(baseUrl, SCHEMA), { max: 2, onnotice: () => {} });
    await setupDisposableSchema(client, SCHEMA, ['esi_refresh_jobs']);
  });

  afterAll(async () => {
    await dropDisposableSchema(client, SCHEMA);
    await client.end({ timeout: 5 }).catch(() => {});
  });

  it('coalesces concurrent budget deferrals for the same dataset and owner', async () => {
    const database = drizzlePg(client);
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
    const database = drizzlePg(client);
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
