import { describe, expect, it } from 'vitest';
import { portraitUrl } from './eve-sso';
import { toLinkedCharacter } from './linked-characters';

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
