import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  after: vi.fn<(work: () => unknown) => void>(),
  accountBelongsToUser: vi.fn<(userId: string, characterId: number) => Promise<boolean>>(),
  listLinkedCharacters: vi.fn(),
  getCharacterSkillLevels: vi.fn<(characterId: number) => Promise<Record<string, number> | null>>(),
}));

vi.mock('next/server', () => ({ after: (work: () => unknown) => h.after(work) }));
vi.mock('@/platform/auth/linked-characters', () => ({
  accountBelongsToUser: h.accountBelongsToUser,
  listLinkedCharacters: h.listLinkedCharacters,
}));
vi.mock('@/features/skill-queue/queries', () => ({
  getCharacterSkillLevels: h.getCharacterSkillLevels,
  getSkillLevelsForCharacters: vi.fn(),
  readCharacterSyncState: vi.fn(),
  saveCharacterSkills: vi.fn(),
  stampCharacterFresh: vi.fn(),
}));
vi.mock('@/features/skill-queue/refresh', () => ({ refreshSkillsForUser: vi.fn() }));
vi.mock('./owner-sync-port', () => ({
  listCharactersWithHealth: vi.fn(),
  readSingleEndpoint: vi.fn(),
  vendTokenFor: vi.fn(),
}));

import { getSkillLevelsForCharacterOnView } from './skills-sync';

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
