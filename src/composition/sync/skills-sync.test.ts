import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  after: vi.fn<(work: () => unknown) => void>(),
  accountBelongsToUser: vi.fn<(userId: string, characterId: number) => Promise<boolean>>(),
  listLinkedCharacters: vi.fn(),
  getCharacterSkillLevels: vi.fn<(characterId: number) => Promise<Record<string, number> | null>>(),
  getSkillLevelsForCharacters: vi.fn(),
  refreshDue: vi.fn(),
}));

vi.mock('next/server', () => ({ after: (work: () => unknown) => h.after(work) }));
vi.mock('@/platform/auth/linked-characters', () => ({
  accountBelongsToUser: h.accountBelongsToUser,
  listLinkedCharacters: h.listLinkedCharacters,
}));
vi.mock('@/features/skill-queue/queries', () => ({
  getCharacterSkillLevels: h.getCharacterSkillLevels,
  getSkillLevelsForCharacters: h.getSkillLevelsForCharacters,
  readCharacterSyncState: vi.fn(),
  saveCharacterSkills: vi.fn(),
  stampCharacterFresh: vi.fn(),
}));
vi.mock('@/features/skill-queue/refresh', () => ({ refreshSkillsForUser: vi.fn() }));
vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: vi.fn(),
  vendTokenFor: vi.fn(),
}));
vi.mock('@/data/esi-store', () => ({ isDue: vi.fn() }));
vi.mock('@/data/esi-store/session', () => ({ openReadSession: vi.fn() }));
vi.mock('./live-dataset-view', () => ({ refreshDue: h.refreshDue }));

import { skillsDueKeys } from '@/features/skill-queue/keys';
import { getSkillLevelsForCharacterOnView, getSkillLevelsForUserOnView } from './skills-sync';

beforeEach(() => {
  h.after.mockClear();
  h.listLinkedCharacters.mockClear();
});

test('every linked character\'s levels come back with one write-behind, saying whether it will reach ESI', async () => {
  h.listLinkedCharacters.mockResolvedValueOnce([{ characterId: 100 }, { characterId: 200 }]);
  h.getSkillLevelsForCharacters.mockResolvedValueOnce(new Map([[100, { '3380': 5 }]]));
  h.refreshDue.mockResolvedValueOnce(true);
  await expect(getSkillLevelsForUserOnView('user-1')).resolves.toEqual({
    characters: [
      { characterId: 100, levels: { '3380': 5 } },
      { characterId: 200, levels: null },
    ],
    refreshing: true,
  });
  expect(h.refreshDue).toHaveBeenCalledExactlyOnceWith('user-1', skillsDueKeys);
  expect(h.after).toHaveBeenCalledOnce();
});

test('one character\'s levels come back only for an owned id, checked without reading the roster', async () => {
  h.accountBelongsToUser.mockResolvedValueOnce(false);
  await expect(getSkillLevelsForCharacterOnView('user-1', 999)).resolves.toBeNull();
  expect(h.accountBelongsToUser).toHaveBeenCalledExactlyOnceWith('user-1', 999);
  expect(h.getCharacterSkillLevels).not.toHaveBeenCalled();
  expect(h.after).not.toHaveBeenCalled();

  h.accountBelongsToUser.mockResolvedValueOnce(true);
  h.getCharacterSkillLevels.mockResolvedValueOnce({ '3380': 5 });
  await expect(getSkillLevelsForCharacterOnView('user-1', 100)).resolves.toEqual({ '3380': 5 });
  expect(h.getCharacterSkillLevels).toHaveBeenCalledExactlyOnceWith(100);
  expect(h.after).toHaveBeenCalledOnce();
  expect(h.listLinkedCharacters).not.toHaveBeenCalled();
});
