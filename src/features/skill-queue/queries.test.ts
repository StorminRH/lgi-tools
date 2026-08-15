import { beforeEach, describe, expect, it, vi } from 'vitest';

// CI skips *.db.test.ts, so these mocked write paths are the sole
// gate-of-record coverage for saveCharacterSkills.

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  set: vi.fn(),
  where: vi.fn().mockResolvedValue(undefined),
  revalidateTag: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    insert: () => ({
      values: (...args: unknown[]) => {
        mocks.values(...args);
        return { onConflictDoUpdate: mocks.onConflictDoUpdate };
      },
    }),
    update: () => ({
      set: (...args: unknown[]) => {
        mocks.set(...args);
        return { where: mocks.where };
      },
    }),
  },
}));

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: mocks.revalidateTag,
}));

import { saveCharacterSkills, skillsTag } from './queries';

beforeEach(() => {
  mocks.values.mockClear();
  mocks.onConflictDoUpdate.mockClear();
  mocks.set.mockClear();
  mocks.where.mockClear();
  mocks.revalidateTag.mockClear();
});

describe('saveCharacterSkills', () => {
  it('upserts both halves, then writes a single half, then still busts the cache', async () => {
    const queueEntries = [{ skill_id: 3300, queue_position: 0, finished_level: 4 }];
    await saveCharacterSkills(101, {
      queue: { entries: queueEntries, etag: 'q' },
      skills: { totalSp: 1_000, levels: { '3300': 3 }, etag: 's' },
    });
    expect(mocks.values.mock.calls.map(([row]) => row)).toEqual([
      {
        characterId: 101,
        totalSp: 1_000,
        unallocatedSp: null,
        queue: queueEntries,
        skillLevels: { '3300': 3 },
      },
      {
        characterId: 101,
        lastRefreshedAt: expect.any(Date),
        queueEtag: 'q',
        skillsEtag: 's',
      },
    ]);
    expect(mocks.onConflictDoUpdate.mock.calls.map(([arg]) => arg)).toEqual([
      {
        target: expect.anything(),
        set: {
          totalSp: 1_000,
          unallocatedSp: null,
          queue: queueEntries,
          skillLevels: { '3300': 3 },
        },
      },
      {
        target: expect.anything(),
        set: {
          lastRefreshedAt: expect.any(Date),
          queueEtag: 'q',
          skillsEtag: 's',
        },
      },
    ]);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(skillsTag(101), 'max');

    mocks.values.mockClear();
    mocks.onConflictDoUpdate.mockClear();
    mocks.revalidateTag.mockClear();
    await saveCharacterSkills(101, {
      queue: { entries: [], etag: 'q-only' },
    });
    expect(mocks.values).not.toHaveBeenCalled();
    expect(mocks.onConflictDoUpdate).not.toHaveBeenCalled();
    expect(mocks.set.mock.calls.map(([row]) => row)).toEqual([
      { queue: [] },
      { lastRefreshedAt: expect.any(Date), queueEtag: 'q-only' },
    ]);
    expect(mocks.where).toHaveBeenCalledTimes(2);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(skillsTag(101), 'max');

    mocks.set.mockClear();
    mocks.where.mockClear();
    mocks.revalidateTag.mockClear();
    await saveCharacterSkills(101, {
      skills: { totalSp: 2_000, unallocatedSp: 10, levels: { '3300': 4 }, etag: 's-only' },
    });
    expect(mocks.set.mock.calls.map(([row]) => row)).toEqual([
      { totalSp: 2_000, unallocatedSp: 10, skillLevels: { '3300': 4 } },
      { lastRefreshedAt: expect.any(Date), skillsEtag: 's-only' },
    ]);
    expect(mocks.where).toHaveBeenCalledTimes(2);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(skillsTag(101), 'max');
  });
});
