import { eq, sql } from 'drizzle-orm';
import { expect, test, vi } from 'vitest';
import { commitWithWrite, recordMetas, storedRow, type EsiResponseMeta } from '@/data/esi-store';
import { db } from '@/db';
import { countSessionsWaitingOn, createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import type { AnyPgDb } from '@/lib/db-types';
import type { OwnerWrite } from '@/platform/owner-sync';
import { industryJob } from './__tests__/job-fixture';
import { characterJobsKey } from './keys';
import { readCharacterJobs, saveCharacterJobs } from './queries';
import { characterIndustryJobs, characterIndustryJobSyncs } from './schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const harness = await createDbTestHarness({
  schema: 'test_industry_jobs_commit_order',
  tables: ['character_industry_jobs', 'character_industry_job_syncs', 'esi_responses'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const CHARACTER = 91_000_001;
const OTHER_CHARACTER = 91_000_002;
const KEY = characterJobsKey(CHARACTER);
const ASKED_ANCIENT = Date.parse('2026-10-12T11:00:00Z');
const ASKED_OLDER = Date.parse('2026-10-12T11:59:00Z');
const ASKED_NEWER = Date.parse('2026-10-12T12:00:00Z');

/** One refresh's answer for a character's jobs, asked for at `checkedAt`. */
function answer(etag: string, checkedAt: number, key = KEY): EsiResponseMeta {
  return { key, expiresAt: checkedAt + 300_000, etags: [etag], lastModified: null, checkedAt };
}

/** A refresh's domain write: the jobs it read, with the ETag the sync row keeps beside them. */
function writeJobs(jobId: number, etag: string): OwnerWrite {
  return saveCharacterJobs(CHARACTER, [industryJob({ job_id: jobId })], etag);
}

async function storedPair() {
  const [jobs, row, sync] = await Promise.all([
    readCharacterJobs(CHARACTER),
    storedRow(KEY),
    harness.db
      .select({ jobsEtag: characterIndustryJobSyncs.jobsEtag })
      .from(characterIndustryJobSyncs)
      .where(eq(characterIndustryJobSyncs.characterId, CHARACTER)),
  ]);
  return { jobIds: jobs?.jobs.map((job) => job.job_id) ?? null, etags: row?.etags ?? null, syncEtag: sync[0]?.jobsEtag ?? null };
}

/**
 * Holds a row lock on KEY's stored answer from a session of the test's own,
 * so every commit that upserts it queues behind, until `release` is called.
 */
async function holdAnswerRow() {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pid: number | undefined;
  const held = harness.sql.begin(async (tx) => {
    const [backend] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    await tx`SELECT 1 FROM esi_responses WHERE route = ${KEY.route} AND holder_id = ${CHARACTER} FOR UPDATE`;
    pid = backend!.pid;
    await released;
  });
  await expect.poll(() => pid, { timeout: 3_000, interval: 10 }).toBeDefined();
  return { pid: pid!, release: async () => { release(); await held; } };
}

test.skipIf(!harness.reachable)(
  'two interleaved refreshes of one owner in HTTP batches: the older answer, committing last, changes nothing',
  async () => {
    await recordMetas([answer('"ancient"', ASKED_ANCIENT)]);
    const lock = await holdAnswerRow();

    const newer = commitWithWrite([answer('"new"', ASKED_NEWER)], writeJobs(2, '"new"'));
    await expect.poll(() => countSessionsWaitingOn(harness.sql, lock.pid), { timeout: 3_000, interval: 20 }).toBe(1);
    // The older refresh reaches its commit while the newer one is still queued, and queues behind it.
    const older = commitWithWrite([answer('"old"', ASKED_OLDER)], writeJobs(1, '"old"'));
    await expect.poll(() => countSessionsWaitingOn(harness.sql, lock.pid), { timeout: 3_000, interval: 20 }).toBe(2);
    expect(await storedPair()).toEqual({ jobIds: null, etags: ['"ancient"'], syncEtag: null });

    await lock.release();
    await expect(newer).resolves.toBe('saved');
    await expect(older).resolves.toBe('superseded');

    expect(await storedPair()).toEqual({ jobIds: [2], etags: ['"new"'], syncEtag: '"new"' });
    expect((await storedRow(KEY))?.checkedAt).toBe(ASKED_NEWER);
  },
);

test.skipIf(!harness.reachable)(
  'an older answer committing after a newer one already stood is superseded; a newer one after an older one replaces both halves',
  async () => {
    await expect(commitWithWrite([answer('"new"', ASKED_NEWER)], writeJobs(2, '"new"'))).resolves.toBe('saved');
    await expect(commitWithWrite([answer('"old"', ASKED_OLDER)], writeJobs(1, '"old"'))).resolves.toBe('superseded');
    expect(await storedPair()).toEqual({ jobIds: [2], etags: ['"new"'], syncEtag: '"new"' });

    const later = ASKED_NEWER + 600_000;
    await expect(commitWithWrite([answer('"later"', later)], writeJobs(3, '"later"'))).resolves.toBe('saved');
    expect(await storedPair()).toEqual({ jobIds: [3], etags: ['"later"'], syncEtag: '"later"' });
  },
);

test.skipIf(!harness.reachable)(
  'a superseded batch inserts no rows either: a newer answer stored with no data keeps the data tables empty',
  async () => {
    await recordMetas([{ key: KEY, expiresAt: ASKED_NEWER + 90_000, etags: [], lastModified: null, checkedAt: ASKED_NEWER }]);

    await expect(commitWithWrite([answer('"old"', ASKED_OLDER)], writeJobs(1, '"old"'))).resolves.toBe('superseded');

    expect(await storedPair()).toEqual({ jobIds: null, etags: [], syncEtag: null });
  },
);

test.skipIf(!harness.reachable)(
  'one commit\'s answers stand all or none: a newer answer on one key keeps every key and the data as they were',
  async () => {
    const otherKey = characterJobsKey(OTHER_CHARACTER);
    await recordMetas([answer('"other-new"', ASKED_NEWER, otherKey)]);

    const outcome = await commitWithWrite(
      [answer('"mine"', ASKED_OLDER), answer('"other-old"', ASKED_OLDER, otherKey)],
      writeJobs(1, '"mine"'),
    );

    expect(outcome).toBe('superseded');
    expect(await storedPair()).toEqual({ jobIds: null, etags: null, syncEtag: null });
    expect((await storedRow(otherKey))?.etags).toEqual(['"other-new"']);
  },
);

test.skipIf(!harness.reachable)(
  'a batch whose statement fails records no answer and keeps none of the rows written before the failure',
  async () => {
    const write = writeJobs(4, '"failed"');
    const failing: OwnerWrite = {
      kind: 'statements',
      build: (answersStand) => [
        ...(write.kind === 'statements' ? write.build(answersStand) : []),
        db.insert(characterIndustryJobs).values({ characterId: OTHER_CHARACTER, jobs: sql`null` }),
      ],
    };

    await expect(commitWithWrite([answer('"failed"', ASKED_NEWER)], failing)).rejects.toThrow();

    expect(await storedPair()).toEqual({ jobIds: null, etags: null, syncEtag: null });
  },
);

test.skipIf(!harness.reachable)(
  'a transaction write that reports itself superseded, or throws, records no answer and keeps nothing it wrote',
  async () => {
    const upsertJobs = (tx: AnyPgDb, jobId: number) =>
      tx.insert(characterIndustryJobs).values({ characterId: CHARACTER, jobs: [industryJob({ job_id: jobId })] });
    const superseded = vi.fn(async (tx: AnyPgDb) => {
      await upsertJobs(tx, 4);
      return 'superseded' as const;
    });
    await expect(commitWithWrite([answer('"lost"', ASKED_NEWER)], { kind: 'transaction', run: superseded })).resolves.toBe('superseded');
    expect(superseded).toHaveBeenCalledOnce();
    expect(await storedPair()).toEqual({ jobIds: null, etags: null, syncEtag: null });

    const failure = new Error('write failed');
    const throwing = async (tx: AnyPgDb) => {
      await upsertJobs(tx, 5);
      throw failure;
    };
    await expect(commitWithWrite([answer('"failed"', ASKED_NEWER)], { kind: 'transaction', run: throwing })).rejects.toBe(failure);
    expect(await storedPair()).toEqual({ jobIds: null, etags: null, syncEtag: null });

    await recordMetas([answer('"new"', ASKED_NEWER)]);
    const older = vi.fn(async () => 'saved' as const);
    await expect(commitWithWrite([answer('"old"', ASKED_OLDER)], { kind: 'transaction', run: older })).resolves.toBe('superseded');
    expect(older).not.toHaveBeenCalled();
  },
);
