import { describe, expect, it, vi } from 'vitest';
import { searchUsersByLinkedCharacterName, toAdminUser } from './queries';

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
  it('returns [] for an empty string without touching the DB', async () => {
    await expect(searchUsersByLinkedCharacterName('')).resolves.toEqual([]);
  });

  it('returns [] for a whitespace-only string', async () => {
    await expect(searchUsersByLinkedCharacterName('   \t\n')).resolves.toEqual([]);
  });
});

describe('toAdminUser', () => {
  const base = {
    userId: 'u1',
    name: 'Ryan',
    portraitUrl: 'https://img/1',
    role: 'ADMIN' as const,
    characterId: '90000001',
  };

  it('parses a numeric characterId string', () => {
    expect(toAdminUser(base)).toEqual({
      userId: 'u1',
      name: 'Ryan',
      portraitUrl: 'https://img/1',
      role: 'ADMIN',
      characterId: 90000001,
    });
  });

  it('yields a null characterId when the account id is null', () => {
    expect(toAdminUser({ ...base, characterId: null }).characterId).toBeNull();
  });

  it('yields a null characterId when the account id is not finite', () => {
    expect(toAdminUser({ ...base, characterId: 'not-a-number' }).characterId).toBeNull();
  });

  it('defaults a null portrait to the empty string', () => {
    expect(toAdminUser({ ...base, portraitUrl: null }).portraitUrl).toBe('');
  });
});
