import { describe, expect, it, vi } from 'vitest';
import { searchUsersByLinkedCharacterName, toAdminUser } from './admin-users';

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
  // CI skips *.db.test.ts, so these mapping arms are the sole gate-of-record
  // falsifiers for the privacy-bounded admin row shape.
  it('maps portrait, role, and characterId arms for the admin view', () => {
    const base = {
      userId: 'u1',
      name: 'Pilot',
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
    expect(toAdminUser({ ...base, characterId: 'not-a-number' }).characterId).toBeNull();
    expect(toAdminUser({ ...base, portraitUrl: null }).portraitUrl).toBe('');
  });
});
