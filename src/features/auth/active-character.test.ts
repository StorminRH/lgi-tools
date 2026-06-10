import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the vi.mock factory can close over them. One `selectRows` value per
// test is enough — each function under test issues a single SELECT (repoint also
// issues an UPDATE, captured by updateSpy).
const h = vi.hoisted(() => ({
  selectRows: [] as Record<string, unknown>[],
  updateSpy: vi.fn(),
}));

// A thenable query builder: every chain method returns the same builder, and
// awaiting it (at any terminal — .where()/.orderBy()/.limit()) resolves to the
// configured rows. UPDATE is a separate spied chain that resolves to [] (so the
// resolver's fire-and-forget `.catch(...)` backfill works).
function selectBuilder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  b.from = () => b;
  b.leftJoin = () => b;
  b.where = () => b;
  b.orderBy = () => b;
  b.limit = () => b;
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(h.selectRows).then(res, rej);
  return b;
}

vi.mock('@/db', () => ({
  db: {
    select: () => selectBuilder(),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          h.updateSpy(vals);
          return Promise.resolve([]);
        },
      }),
    }),
  },
}));

import {
  accountBelongsToUser,
  listLinkedCharacters,
  repointActiveToOldest,
  resolveActiveCharacter,
} from './queries';

beforeEach(() => {
  h.selectRows = [];
  h.updateSpy.mockReset();
});

describe('resolveActiveCharacter', () => {
  const TWO = [
    { accountId: '100', name: 'Alice', portraitUrl: 'a' },
    { accountId: '200', name: 'Bob', portraitUrl: 'b' },
  ];

  it('returns the preferred character when it is still linked (no backfill)', async () => {
    h.selectRows = TWO;
    const result = await resolveActiveCharacter('u1', 200);
    expect(result).toEqual({ characterId: 200, name: 'Bob', portraitUrl: 'b' });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it('falls back to the oldest and backfills when the preferred id is stale', async () => {
    h.selectRows = TWO;
    const result = await resolveActiveCharacter('u1', 999);
    expect(result).toEqual({ characterId: 100, name: 'Alice', portraitUrl: 'a' });
    expect(h.updateSpy).toHaveBeenCalledTimes(1);
    expect(h.updateSpy.mock.calls[0][0]).toMatchObject({ activeCharacterId: 100 });
  });

  it('uses the oldest (first) account when no preferred id is set, without backfilling', async () => {
    h.selectRows = TWO;
    const result = await resolveActiveCharacter('u1', null);
    expect(result).toEqual({ characterId: 100, name: 'Alice', portraitUrl: 'a' });
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it('returns null when the user has no linked accounts', async () => {
    h.selectRows = [];
    expect(await resolveActiveCharacter('u1', 100)).toBeNull();
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it('returns null name/portrait when the character profile row is missing (caller coalesces)', async () => {
    h.selectRows = [{ accountId: '100', name: null, portraitUrl: null }];
    expect(await resolveActiveCharacter('u1', null)).toEqual({
      characterId: 100,
      name: null,
      portraitUrl: null,
    });
  });
});

describe('accountBelongsToUser', () => {
  it('is true when a matching account row exists', async () => {
    h.selectRows = [{ id: 'acc1' }];
    expect(await accountBelongsToUser('u1', 100)).toBe(true);
  });

  it('is false when no row matches', async () => {
    h.selectRows = [];
    expect(await accountBelongsToUser('u1', 100)).toBe(false);
  });
});

describe('repointActiveToOldest', () => {
  it('points the active character at the oldest remaining account', async () => {
    h.selectRows = [{ accountId: '300' }];
    expect(await repointActiveToOldest('u1')).toBe(300);
    expect(h.updateSpy.mock.calls[0][0]).toMatchObject({ activeCharacterId: 300 });
  });

  it('clears the active character to null when none remain', async () => {
    h.selectRows = [];
    expect(await repointActiveToOldest('u1')).toBeNull();
    expect(h.updateSpy.mock.calls[0][0]).toMatchObject({ activeCharacterId: null });
  });
});

describe('listLinkedCharacters', () => {
  it('maps token presence and falls back for a missing profile row', async () => {
    h.selectRows = [
      {
        accountId: '100',
        scope: 'publicData',
        refreshToken: 'v1:abc',
        createdAt: new Date('2026-01-01'),
        name: 'Alice',
        portraitUrl: 'a',
      },
      {
        accountId: '200',
        scope: null,
        refreshToken: null,
        createdAt: new Date('2026-02-01'),
        name: null,
        portraitUrl: null,
      },
    ];
    const result = await listLinkedCharacters('u1');
    expect(result[0]).toMatchObject({ characterId: 100, name: 'Alice', hasRefreshToken: true });
    expect(result[1]).toMatchObject({ characterId: 200, name: 'Character 200', hasRefreshToken: false });
    // Missing profile portrait falls back to the EVE image-server URL.
    expect(result[1].portraitUrl).toContain('/characters/200/portrait');
  });
});
