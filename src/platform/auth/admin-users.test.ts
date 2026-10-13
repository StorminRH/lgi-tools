import { expect, test, vi } from 'vitest';
import { containsPattern, searchUsersByLinkedCharacterName, toAdminUser } from './admin-users';

vi.mock('@/db', () => ({
  db: {
    select: () => {
      throw new Error(
        'searchUsersByLinkedCharacterName must short-circuit and never hit the DB for empty/whitespace input',
      );
    },
  },
}));

test('searchUsersByLinkedCharacterName returns [] for empty or whitespace input without touching the DB', async () => {
  await expect(searchUsersByLinkedCharacterName('')).resolves.toEqual([]);
  await expect(searchUsersByLinkedCharacterName('   \t\n')).resolves.toEqual([]);
});

test('containsPattern wraps the text in match-anywhere wildcards and escapes %, _ and the escape character itself', () => {
  expect(containsPattern('pilot')).toBe('%pilot%');
  expect(containsPattern('100%')).toBe('%100\\%%');
  expect(containsPattern('a_b')).toBe('%a\\_b%');
  expect(containsPattern('back\\slash')).toBe('%back\\\\slash%');
  expect(containsPattern('%_\\')).toBe('%\\%\\_\\\\%');
});

test('toAdminUser maps a row for the admin view, naming the user by character, then the unresolved character id, then the account', () => {
  const base = {
    userId: 'u1',
    userName: 'Account label',
    characterName: 'Pilot',
    portraitUrl: 'https://img/1',
    role: 'ADMIN' as const,
    characterId: '90000001',
  };
  expect(toAdminUser(base)).toEqual({
    userId: 'u1',
    name: 'Pilot',
    portraitUrl: 'https://img/1',
    role: 'ADMIN',
    characterId: 90000001,
  });
  expect(toAdminUser({ ...base, characterId: null }).characterId).toBeNull();
  expect(toAdminUser({ ...base, portraitUrl: null }).portraitUrl).toBe('');
  expect(toAdminUser({ ...base, characterName: null }).name).toBe('Character 90000001');
  expect(toAdminUser({ ...base, characterName: null, characterId: null }).name).toBe('Account label');
});
