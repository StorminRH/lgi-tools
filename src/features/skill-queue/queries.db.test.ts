import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { commitWithWrite } from '@/data/esi-store';
import { characterSkills, characterSkillSyncs } from './schema';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: mocks.revalidateTag,
}));

import { listCharacterSkillSyncStates, readCharacterSkillRow, saveCharacterSkills } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_skill_queue_save',
  tables: ['character_skills', 'character_skill_syncs'],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const OLD_STAMP = new Date('2020-01-01T00:00:00Z');

async function readRows(characterId: number) {
  const [data] = await harness.db
    .select()
    .from(characterSkills)
    .where(eq(characterSkills.characterId, characterId));
  const [sync] = await harness.db
    .select()
    .from(characterSkillSyncs)
    .where(eq(characterSkillSyncs.characterId, characterId));
  return { data, sync };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.skipIf(!harness.reachable)('saveCharacterSkills executes against Postgres', () => {
  it('inserts the first full save and replaces both halves on conflict', async () => {
    await commitWithWrite([], saveCharacterSkills(101, {
      queue: {
        entries: [{ skill_id: 3300, queue_position: 0, finished_level: 4 }],
        etag: 'queue-first',
      },
      skills: {
        totalSp: 1_000_000,
        unallocatedSp: 50_000,
        levels: { '3300': 3 },
        etag: 'skills-first',
      },
    }));

    expect(await readRows(101)).toEqual({
      data: {
        characterId: 101,
        totalSp: 1_000_000,
        unallocatedSp: 50_000,
        queue: [{ skill_id: 3300, queue_position: 0, finished_level: 4 }],
        skillLevels: { '3300': 3 },
      },
      sync: {
        characterId: 101,
        lastRefreshedAt: expect.any(Date),
        queueEtag: 'queue-first',
        skillsEtag: 'skills-first',
      },
    });

    await commitWithWrite([], saveCharacterSkills(101, {
      queue: {
        entries: [{ skill_id: 4400, queue_position: 0, finished_level: 5 }],
        etag: 'queue-second',
      },
      skills: {
        totalSp: 2_000_000,
        levels: { '3300': 4, '4400': 2 },
        etag: 'skills-second',
      },
    }));

    expect(await readRows(101)).toEqual({
      data: {
        characterId: 101,
        totalSp: 2_000_000,
        unallocatedSp: null,
        queue: [{ skill_id: 4400, queue_position: 0, finished_level: 5 }],
        skillLevels: { '3300': 4, '4400': 2 },
      },
      sync: {
        characterId: 101,
        lastRefreshedAt: expect.any(Date),
        queueEtag: 'queue-second',
        skillsEtag: 'skills-second',
      },
    });
    // The sync's commit clears the skills tag once the answers are recorded; the write itself clears nothing.
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('updates only the queue half and advances freshness', async () => {
    await harness.db.insert(characterSkills).values({
      characterId: 202,
      totalSp: 2_000_000,
      unallocatedSp: 25_000,
      queue: [{ skill_id: 3300, queue_position: 0, finished_level: 4 }],
      skillLevels: { '3300': 3 },
    });
    await harness.db.insert(characterSkillSyncs).values({
      characterId: 202,
      lastRefreshedAt: OLD_STAMP,
      queueEtag: 'queue-old',
      skillsEtag: 'skills-held',
    });

    await commitWithWrite([], saveCharacterSkills(202, {
      queue: {
        entries: [{ skill_id: 4400, queue_position: 0, finished_level: 5 }],
        etag: 'queue-new',
      },
    }));

    const { data, sync } = await readRows(202);
    expect(data).toEqual({
      characterId: 202,
      totalSp: 2_000_000,
      unallocatedSp: 25_000,
      queue: [{ skill_id: 4400, queue_position: 0, finished_level: 5 }],
      skillLevels: { '3300': 3 },
    });
    expect(sync).toMatchObject({
      characterId: 202,
      queueEtag: 'queue-new',
      skillsEtag: 'skills-held',
    });
    expect(sync?.lastRefreshedAt.getTime()).toBeGreaterThan(OLD_STAMP.getTime());
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('updates only the skills half and preserves the queue contract', async () => {
    await harness.db.insert(characterSkills).values({
      characterId: 303,
      totalSp: 3_000_000,
      unallocatedSp: 10_000,
      queue: [{ skill_id: 3300, queue_position: 0, finished_level: 4 }],
      skillLevels: { '3300': 3 },
    });
    await harness.db.insert(characterSkillSyncs).values({
      characterId: 303,
      lastRefreshedAt: OLD_STAMP,
      queueEtag: 'queue-held',
      skillsEtag: 'skills-old',
    });

    await commitWithWrite([], saveCharacterSkills(303, {
      skills: {
        totalSp: 4_000_000,
        levels: { '3300': 4, '4400': 1 },
        etag: 'skills-new',
      },
    }));

    const { data, sync } = await readRows(303);
    expect(data).toEqual({
      characterId: 303,
      totalSp: 4_000_000,
      unallocatedSp: null,
      queue: [{ skill_id: 3300, queue_position: 0, finished_level: 4 }],
      skillLevels: { '3300': 4, '4400': 1 },
    });
    expect(sync).toMatchObject({
      characterId: 303,
      queueEtag: 'queue-held',
      skillsEtag: 'skills-new',
    });
    expect(sync?.lastRefreshedAt.getTime()).toBeGreaterThan(OLD_STAMP.getTime());
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});

describe.skipIf(!harness.reachable)('readCharacterSkillRow executes against Postgres', () => {
  it('reads the queue, SP figures and levels from one row and keeps nullable columns apart', async () => {
    expect(await readCharacterSkillRow(404)).toBeNull();

    await harness.db.insert(characterSkills).values([
      {
        characterId: 404,
        totalSp: 5_000_000,
        unallocatedSp: 75_000,
        queue: [{ skill_id: 3300, queue_position: 0, finished_level: 5 }],
        skillLevels: { '3300': 4, '3327': 5 },
      },
      {
        characterId: 505,
        totalSp: 1_500_000,
        unallocatedSp: null,
        queue: [],
        skillLevels: null,
      },
    ]);

    expect(await readCharacterSkillRow(404)).toStrictEqual({
      data: {
        entries: [{ skill_id: 3300, queue_position: 0, finished_level: 5 }],
        totalSp: 5_000_000,
        unallocatedSp: 75_000,
      },
      levels: { '3300': 4, '3327': 5 },
    });
    expect(await readCharacterSkillRow(505)).toStrictEqual({
      data: { entries: [], totalSp: 1_500_000 },
      levels: null,
    });
  });
});

describe.skipIf(!harness.reachable)('listCharacterSkillSyncStates executes against Postgres', () => {
  it('maps each listed character with a sync row to its state in one batch and leaves the rest absent', async () => {
    expect(await listCharacterSkillSyncStates([])).toEqual(new Map());

    const newer = new Date('2026-09-27T11:58:00Z');
    await harness.db.insert(characterSkillSyncs).values([
      { characterId: 606, lastRefreshedAt: OLD_STAMP, queueEtag: '"queue-606"', skillsEtag: null },
      { characterId: 707, lastRefreshedAt: newer, queueEtag: null, skillsEtag: '"skills-707"' },
      { characterId: 808, lastRefreshedAt: newer, queueEtag: null, skillsEtag: null },
    ]);

    expect(await listCharacterSkillSyncStates([707, 909, 606])).toEqual(new Map([
      [707, { lastRefreshedAt: newer }],
      [606, { lastRefreshedAt: OLD_STAMP }],
    ]));
  });
});
