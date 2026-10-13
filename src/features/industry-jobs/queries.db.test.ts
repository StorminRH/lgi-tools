import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { expect, test, vi } from 'vitest';
import { commitWithWrite, recordMetas, storedRow } from '@/data/esi-store';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { industryJob } from './__tests__/job-fixture';
import { corpJobsKey } from './keys';
import {
  listCharacterJobSyncStates,
  listCorpJobSyncStates,
  readCharacterJobs,
  readCorpJobSyncState,
  saveCharacterJobs,
  saveCorpJobs,
  saveCorpNeedsRole,
} from './queries';
import { characterIndustryJobSyncs, corpIndustryJobs, corpIndustryJobSyncs } from './schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const harness = await createDbTestHarness({
  schema: 'test_industry_jobs_queries',
  tables: ['corp_industry_jobs', 'corp_industry_job_syncs', 'character_industry_jobs', 'character_industry_job_syncs', 'esi_responses'],
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
      { corporationId: 98_000_001, lastRefreshedAt: stamp, syncError: 'needs_role' },
      { corporationId: 98_000_002, lastRefreshedAt: stamp, syncError: null },
      { corporationId: 98_000_003, lastRefreshedAt: stamp, syncError: null },
    ]);
    expect(await readCorpJobSyncState('user-a', 98_000_002)).toEqual({
      lastRefreshedAt: stamp,
      syncError: null,
    });
    expect(await readCorpJobSyncState('user-a', 98_000_000)).toBeNull();
    expect(await listCorpJobSyncStates('user-c')).toEqual([]);
  },
);

test.skipIf(!harness.reachable)(
  'character job sync states map each listed character with a row in one batch and leave the rest absent',
  async () => {
    expect(await listCharacterJobSyncStates([])).toEqual(new Map());

    const older = new Date('2026-01-02T03:04:05Z');
    const newer = new Date('2026-01-03T03:04:05Z');
    await harness.db.insert(characterIndustryJobSyncs).values([
      { characterId: 90_000_001, lastRefreshedAt: older, jobsEtag: '"a"' },
      { characterId: 90_000_002, lastRefreshedAt: newer, jobsEtag: null },
      { characterId: 90_000_003, lastRefreshedAt: newer, jobsEtag: '"c"' },
    ]);

    expect(await listCharacterJobSyncStates([90_000_002, 90_000_009, 90_000_001])).toEqual(new Map([
      [90_000_002, { lastRefreshedAt: newer }],
      [90_000_001, { lastRefreshedAt: older }],
    ]));
  },
);

test.skipIf(!harness.reachable)(
  'job saves store the feed and leave the tag to the sync\'s commit, and a needs-role save clears the corporation jobs',
  async () => {
    vi.mocked(revalidateTag).mockClear();
    await commitWithWrite([], saveCharacterJobs(90_000_010, [industryJob({ job_id: 7 })], '"char"'));
    expect(await readCharacterJobs(90_000_010)).toEqual({ jobs: [industryJob({ job_id: 7 })] });
    expect(revalidateTag).not.toHaveBeenCalled();

    const corpJobs = () => harness.db
      .select({ jobs: corpIndustryJobs.jobs })
      .from(corpIndustryJobs)
      .where(and(eq(corpIndustryJobs.userId, 'user-d'), eq(corpIndustryJobs.corporationId, 98_000_010)));
    vi.mocked(revalidateTag).mockClear();
    await commitWithWrite([], saveCorpJobs('user-d', 98_000_010, [industryJob({ job_id: 8 })], '"corp"'));
    const key = corpJobsKey('user-d', 98_000_010);
    await recordMetas([{ key, expiresAt: Date.now() + 300_000, etags: ['"corp"'], lastModified: null, checkedAt: Date.now() }]);
    expect(await corpJobs()).toEqual([{ jobs: [industryJob({ job_id: 8 })] }]);
    expect(await readCorpJobSyncState('user-d', 98_000_010)).toMatchObject({ syncError: null });

    // The stored answer goes with the rows its ETag vouched for, so the read after the role returns is a 200, not a 304 over nothing.
    await saveCorpNeedsRole('user-d', 98_000_010);
    expect(await corpJobs()).toEqual([]);
    expect(await storedRow(key)).toBeNull();
    expect(await readCorpJobSyncState('user-d', 98_000_010)).toMatchObject({ syncError: 'needs_role' });
    expect(revalidateTag).not.toHaveBeenCalled();
  },
);
