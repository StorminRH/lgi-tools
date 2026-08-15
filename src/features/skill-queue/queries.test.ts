import { beforeEach, describe, expect, it, vi } from 'vitest';

// CI skips *.db.test.ts, so these mocked write paths are the sole
// gate-of-record coverage for saveCharacterSkills.

const mocks = vi.hoisted(() => ({
  insertOnConflict: vi.fn().mockResolvedValue(undefined),
  updateWhere: vi.fn().mockResolvedValue(undefined),
  revalidateTag: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: mocks.insertOnConflict,
      }),
    }),
    update: () => ({
      set: () => ({
        where: mocks.updateWhere,
      }),
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
  mocks.insertOnConflict.mockClear();
  mocks.updateWhere.mockClear();
  mocks.revalidateTag.mockClear();
});

describe('saveCharacterSkills', () => {
  it('upserts both halves, then writes a single half, then still busts the cache', async () => {
    await saveCharacterSkills(101, {
      queue: { entries: [{ skill_id: 3300, queue_position: 0, finished_level: 4 }], etag: 'q' },
      skills: { totalSp: 1_000, levels: { '3300': 3 }, etag: 's' },
    });
    expect(mocks.insertOnConflict).toHaveBeenCalledTimes(2);
    expect(mocks.updateWhere).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(skillsTag(101), 'max');

    mocks.insertOnConflict.mockClear();
    mocks.revalidateTag.mockClear();
    await saveCharacterSkills(101, {
      queue: { entries: [], etag: 'q-only' },
    });
    expect(mocks.insertOnConflict).not.toHaveBeenCalled();
    expect(mocks.updateWhere).toHaveBeenCalledTimes(2);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(skillsTag(101), 'max');

    mocks.updateWhere.mockClear();
    mocks.revalidateTag.mockClear();
    await saveCharacterSkills(101, {
      skills: { totalSp: 2_000, unallocatedSp: 10, levels: { '3300': 4 }, etag: 's-only' },
    });
    expect(mocks.updateWhere).toHaveBeenCalledTimes(2);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(skillsTag(101), 'max');
  });
});
