import { describe, expect, it, vi } from 'vitest';
import { searchCharactersByName } from './queries';

vi.mock('@/db', () => ({
  db: {
    select: () => {
      throw new Error(
        'searchCharactersByName must short-circuit and never hit the DB for empty/whitespace input',
      );
    },
  },
}));

describe('searchCharactersByName', () => {
  it('returns [] for an empty string without touching the DB', async () => {
    await expect(searchCharactersByName('')).resolves.toEqual([]);
  });

  it('returns [] for a whitespace-only string', async () => {
    await expect(searchCharactersByName('   \t\n')).resolves.toEqual([]);
  });
});
