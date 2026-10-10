import { expect, test, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { listCorpJobSyncStates, readCorpJobSyncState } from './queries';
import { corpIndustryJobSyncs } from './schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const harness = await createDbTestHarness({
  schema: 'test_industry_jobs_queries',
  tables: ['corp_industry_job_syncs'],
  steerDbProxy: true,
});

test.skipIf(!harness.reachable)(
  'corp job sync states list one user’s corporations in corporation id order',
  async () => {
    const stamp = new Date('2026-01-02T03:04:05Z');
    await harness.db.insert(corpIndustryJobSyncs).values([
      { userId: 'user-a', corporationId: 98_000_003, lastRefreshedAt: stamp, jobsEtag: '"c"', syncError: null },
      { userId: 'user-b', corporationId: 98_000_000, lastRefreshedAt: stamp, jobsEtag: null, syncError: null },
      { userId: 'user-a', corporationId: 98_000_001, lastRefreshedAt: stamp, jobsEtag: null, syncError: 'needs_role' },
      { userId: 'user-a', corporationId: 98_000_002, lastRefreshedAt: stamp, jobsEtag: '"b"', syncError: null },
    ]);

    expect(await listCorpJobSyncStates('user-a')).toEqual([
      { corporationId: 98_000_001, lastRefreshedAt: stamp, jobsEtag: null, syncError: 'needs_role' },
      { corporationId: 98_000_002, lastRefreshedAt: stamp, jobsEtag: '"b"', syncError: null },
      { corporationId: 98_000_003, lastRefreshedAt: stamp, jobsEtag: '"c"', syncError: null },
    ]);
    expect(await readCorpJobSyncState('user-a', 98_000_002)).toEqual({
      lastRefreshedAt: stamp,
      jobsEtag: '"b"',
      syncError: null,
    });
    expect(await readCorpJobSyncState('user-a', 98_000_000)).toBeNull();
    expect(await listCorpJobSyncStates('user-c')).toEqual([]);
  },
);
