import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/test-support/db-test-harness';
import { characterSkills, characterSkillSyncs } from './schema';

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: mocks.revalidateTag,
}));

import { saveCharacterSkills, skillsTag } from './queries';

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
    await saveCharacterSkills(101, {
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
    });

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

    await saveCharacterSkills(101, {
      queue: {
        entries: [{ skill_id: 4400, queue_position: 0, finished_level: 5 }],
        etag: 'queue-second',
      },
      skills: {
        totalSp: 2_000_000,
        levels: { '3300': 4, '4400': 2 },
        etag: 'skills-second',
      },
    });

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
    expect(mocks.revalidateTag).toHaveBeenNthCalledWith(1, skillsTag(101), 'max');
    expect(mocks.revalidateTag).toHaveBeenNthCalledWith(2, skillsTag(101), 'max');
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

    await saveCharacterSkills(202, {
      queue: {
        entries: [{ skill_id: 4400, queue_position: 0, finished_level: 5 }],
        etag: 'queue-new',
      },
    });

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
    expect(mocks.revalidateTag).toHaveBeenCalledWith(skillsTag(202), 'max');
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

    await saveCharacterSkills(303, {
      skills: {
        totalSp: 4_000_000,
        levels: { '3300': 4, '4400': 1 },
        etag: 'skills-new',
      },
    });

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
    expect(mocks.revalidateTag).toHaveBeenCalledWith(skillsTag(303), 'max');
  });
});
