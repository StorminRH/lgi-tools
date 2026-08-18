import { beforeEach, describe, expect, it, vi } from 'vitest';
import { portraitUrl } from './eve-sso';

// CI skips *.db.test.ts, so these canned-row arms are the sole gate-of-record
// coverage for toLinkedCharacter and resolveActiveCharacter.

let linkedRows: Array<{
  accountId: string;
  scope: string | null;
  refreshToken: string | null;
  createdAt: Date;
  name: string | null;
  portraitUrl: string | null;
  corporationId: number | null;
  affiliationRefreshedAt: Date | null;
}> = [];

const updateWhere = vi.fn().mockResolvedValue(undefined);

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(linkedRows),
          }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: updateWhere,
      }),
    }),
  },
}));

import { listLinkedCharacters, resolveActiveCharacter } from './linked-characters';

const LINKED_AT = new Date('2026-01-01T00:00:00Z');

beforeEach(() => {
  linkedRows = [];
  updateWhere.mockClear();
});

describe('listLinkedCharacters', () => {
  it('synthesises name and portrait, and flags a usable refresh token', async () => {
    linkedRows = [
      {
        accountId: '90000001',
        scope: 'esi-skills.read_skills.v1',
        refreshToken: 'refresh',
        createdAt: LINKED_AT,
        name: 'Pilot One',
        portraitUrl: 'https://img/1',
        corporationId: 98000001,
        affiliationRefreshedAt: LINKED_AT,
      },
      {
        accountId: '90000002',
        scope: null,
        refreshToken: '',
        createdAt: LINKED_AT,
        name: null,
        portraitUrl: null,
        corporationId: null,
        affiliationRefreshedAt: null,
      },
      {
        accountId: 'not-a-number',
        scope: null,
        refreshToken: null,
        createdAt: LINKED_AT,
        name: 'Dropped',
        portraitUrl: null,
        corporationId: null,
        affiliationRefreshedAt: null,
      },
    ];

    await expect(listLinkedCharacters('user-1')).resolves.toEqual([
      {
        characterId: 90000001,
        name: 'Pilot One',
        portraitUrl: 'https://img/1',
        scope: 'esi-skills.read_skills.v1',
        hasRefreshToken: true,
        linkedAt: LINKED_AT,
        corporationId: 98000001,
        affiliationRefreshedAt: LINKED_AT,
      },
      {
        characterId: 90000002,
        name: 'Character 90000002',
        portraitUrl: portraitUrl(90000002),
        scope: null,
        hasRefreshToken: false,
        linkedAt: LINKED_AT,
        corporationId: null,
        affiliationRefreshedAt: null,
      },
    ]);
  });
});

describe('resolveActiveCharacter', () => {
  it('keeps, falls back, backfills, and clears when nothing is linked', async () => {
    await expect(resolveActiveCharacter('user-1', 90000001)).resolves.toBeNull();
    expect(updateWhere).not.toHaveBeenCalled();

    linkedRows = [
      {
        accountId: '90000001',
        scope: null,
        refreshToken: null,
        createdAt: LINKED_AT,
        name: 'Oldest',
        portraitUrl: 'https://img/1',
        corporationId: null,
        affiliationRefreshedAt: null,
      },
      {
        accountId: '90000002',
        scope: null,
        refreshToken: null,
        createdAt: LINKED_AT,
        name: 'Preferred',
        portraitUrl: 'https://img/2',
        corporationId: null,
        affiliationRefreshedAt: null,
      },
    ];
    await expect(resolveActiveCharacter('user-1', 90000002)).resolves.toEqual({
      characterId: 90000002,
      name: 'Preferred',
      portraitUrl: 'https://img/2',
    });
    expect(updateWhere).not.toHaveBeenCalled();

    linkedRows = [linkedRows[0]!];
    await expect(resolveActiveCharacter('user-1', 90000099)).resolves.toEqual({
      characterId: 90000001,
      name: 'Oldest',
      portraitUrl: 'https://img/1',
    });
    expect(updateWhere).toHaveBeenCalled();

    updateWhere.mockClear();
    linkedRows = [
      {
        accountId: '90000001',
        scope: null,
        refreshToken: null,
        createdAt: LINKED_AT,
        name: null,
        portraitUrl: null,
        corporationId: null,
        affiliationRefreshedAt: null,
      },
    ];
    await expect(resolveActiveCharacter('user-1', null)).resolves.toEqual({
      characterId: 90000001,
      name: null,
      portraitUrl: null,
    });
    expect(updateWhere).not.toHaveBeenCalled();
  });
});
