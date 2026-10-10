import { describe, expect, it, vi } from 'vitest';
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

describe('searchUsersByLinkedCharacterName', () => {
  it('returns [] for empty or whitespace input without touching the DB', async () => {
    await expect(searchUsersByLinkedCharacterName('')).resolves.toEqual([]);
    await expect(searchUsersByLinkedCharacterName('   \t\n')).resolves.toEqual([]);
  });
});

describe('containsPattern', () => {
  it('wraps plain text in match-anywhere wildcards', () => {
    expect(containsPattern('pilot')).toBe('%pilot%');
  });

  it('escapes the LIKE wildcards and the escape character itself', () => {
    expect(containsPattern('100%')).toBe('%100\\%%');
    expect(containsPattern('a_b')).toBe('%a\\_b%');
    expect(containsPattern('back\\slash')).toBe('%back\\\\slash%');
    expect(containsPattern('%_\\')).toBe('%\\%\\_\\\\%');
  });
});

describe('toAdminUser', () => {
  const base = {
    userId: 'u1',
    userName: 'Account label',
    characterName: 'Pilot',
    portraitUrl: 'https://img/1',
    role: 'ADMIN' as const,
    characterId: '90000001',
  };

  it('maps portrait, role, and characterId arms for the admin view', () => {
    expect(toAdminUser(base)).toEqual({
      userId: 'u1',
      name: 'Pilot',
      portraitUrl: 'https://img/1',
      role: 'ADMIN',
      characterId: 90000001,
    });
    expect(toAdminUser({ ...base, characterId: null }).characterId).toBeNull();
    expect(toAdminUser({ ...base, characterId: 'not-a-number' }).characterId).toBeNull();
    expect(toAdminUser({ ...base, portraitUrl: null }).portraitUrl).toBe('');
  });

  it('names the user by character, then the unresolved character id, then the account', () => {
    expect(toAdminUser(base).name).toBe('Pilot');
    expect(toAdminUser({ ...base, characterName: null }).name).toBe('Character 90000001');
    expect(toAdminUser({ ...base, characterName: null, characterId: null }).name).toBe('Account label');
  });
});
