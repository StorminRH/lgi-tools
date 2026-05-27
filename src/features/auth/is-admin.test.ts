import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAdmin } from './session';
import type { Session } from './types';

const userSession: Session = {
  characterId: 12345,
  name: 'Test User',
  portraitUrl: 'https://images.evetech.net/characters/12345/portrait?size=128',
  role: 'USER',
};

const adminSession: Session = {
  characterId: 67890,
  name: 'Test Admin',
  portraitUrl: 'https://images.evetech.net/characters/67890/portrait?size=128',
  role: 'ADMIN',
};

const superSession: Session = {
  characterId: 1000000000,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/1000000000/portrait?size=128',
  role: 'USER',
};

describe('isAdmin', () => {
  beforeEach(() => {
    vi.stubEnv('SUPERADMIN_CHARACTER_ID', '1000000000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false for a null session', () => {
    expect(isAdmin(null)).toBe(false);
  });

  it('returns false for a plain USER who is not the superadmin', () => {
    expect(isAdmin(userSession)).toBe(false);
  });

  it('returns true for a DB-ADMIN', () => {
    expect(isAdmin(adminSession)).toBe(true);
  });

  it('returns true for the env superadmin even with a USER DB role', () => {
    expect(isAdmin(superSession)).toBe(true);
  });

  describe('with SUPERADMIN_CHARACTER_ID unset', () => {
    beforeEach(() => {
      vi.stubEnv('SUPERADMIN_CHARACTER_ID', '');
    });

    it('still returns false for a plain USER (no env fallback to grant)', () => {
      expect(isAdmin(userSession)).toBe(false);
    });

    it('still returns true for a DB-ADMIN', () => {
      expect(isAdmin(adminSession)).toBe(true);
    });
  });

  describe('with SUPERADMIN_CHARACTER_ID set to garbage', () => {
    beforeEach(() => {
      vi.stubEnv('SUPERADMIN_CHARACTER_ID', 'not-a-number');
    });

    it('returns false for a USER — Number() yields NaN, which never matches', () => {
      expect(isAdmin(userSession)).toBe(false);
    });

    it('still grants ADMIN via the DB-role path', () => {
      expect(isAdmin(adminSession)).toBe(true);
    });
  });
});
