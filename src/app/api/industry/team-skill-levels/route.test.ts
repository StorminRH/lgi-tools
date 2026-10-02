import { beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userId: null as string | null,
  levels: vi.fn(),
}));

vi.mock('@/composition/session', () => ({ getCurrentUserId: async () => h.userId }));
vi.mock('@/composition/sync/skills-sync', () => ({
  getSkillLevelsForUserOnView: (userId: string) => h.levels(userId),
}));
vi.mock('@/app/api/owned-data-telemetry', () => ({
  measureOwnedDataRead: (input: { read: () => Promise<unknown> }) => input.read(),
}));

import { GET } from './route';

beforeEach(() => {
  h.levels.mockReset();
});

it('reads every linked character’s levels for the signed-in account, and nothing when signed out', async () => {
  h.userId = null;
  await expect((await GET()).json()).resolves.toEqual({ characters: [] });
  expect(h.levels).not.toHaveBeenCalled();

  h.userId = 'user-1';
  h.levels.mockResolvedValue([
    { characterId: 9001, levels: { 3380: 5, 3388: 4 } },
    { characterId: 9002, levels: null },
  ]);
  const res = await GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({
    characters: [
      { characterId: 9001, levels: { 3380: 5, 3388: 4 } },
      { characterId: 9002, levels: null },
    ],
  });
  expect(h.levels).toHaveBeenCalledWith('user-1');
});
