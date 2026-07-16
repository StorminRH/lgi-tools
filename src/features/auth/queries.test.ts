import { describe, expect, it, vi } from 'vitest';
import { portraitUrl } from './eve-sso';
import { searchUsersByLinkedCharacterName, toAdminUser, toLinkedCharacter } from './queries';

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

describe('toLinkedCharacter', () => {
  const row = {
    accountId: '90000001',
    scope: 'esi-skills.read_skills.v1',
    refreshToken: 'tok',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    name: 'Ryan',
    portraitUrl: 'https://img/1',
    corporationId: 98000001,
    affiliationRefreshedAt: new Date('2026-07-10T00:00:00Z'),
  };

  it('maps a fully-populated row', () => {
    expect(toLinkedCharacter(row)).toEqual({
      characterId: 90000001,
      name: 'Ryan',
      portraitUrl: 'https://img/1',
      scope: 'esi-skills.read_skills.v1',
      hasRefreshToken: true,
      linkedAt: new Date('2026-07-01T00:00:00Z'),
      corporationId: 98000001,
      affiliationRefreshedAt: new Date('2026-07-10T00:00:00Z'),
    });
  });

  it('synthesises a name and portrait when the profile row is missing', () => {
    const c = toLinkedCharacter({ ...row, name: null, portraitUrl: null });
    expect(c.name).toBe('Character 90000001');
    expect(c.portraitUrl).toBe(portraitUrl(90000001));
  });

  it('reports no refresh token for a null or empty token', () => {
    expect(toLinkedCharacter({ ...row, refreshToken: null }).hasRefreshToken).toBe(false);
    expect(toLinkedCharacter({ ...row, refreshToken: '' }).hasRefreshToken).toBe(false);
  });

  it('coalesces a missing corp / affiliation timestamp to null', () => {
    const c = toLinkedCharacter({ ...row, corporationId: null, affiliationRefreshedAt: null });
    expect(c.corporationId).toBeNull();
    expect(c.affiliationRefreshedAt).toBeNull();
  });
});
