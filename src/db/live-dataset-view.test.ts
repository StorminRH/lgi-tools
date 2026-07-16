import { beforeEach, describe, expect, it, vi } from 'vitest';

// after() normally defers to post-response; the mock records + invokes it so a test can
// assert the write-behind was scheduled AND ran.
const afterCalls: Array<() => void> = [];
vi.mock('next/server', () => ({
  after: (fn: () => void) => {
    afterCalls.push(fn);
    fn();
  },
}));

// getTypeNames resolves the SDE name map; capture the ids it was asked for.
const getTypeNamesArgs: number[][] = [];
vi.mock('@/data/eve-data/queries', () => ({
  getTypeNames: vi.fn(async (ids: number[]) => {
    getTypeNamesArgs.push(ids);
    return new Map(ids.map((id) => [id, `Type #${id}`]));
  }),
}));

// listLinkedCharacters enumerates a user's characters (readCharacterOwners' first step).
const linkedByUser: Record<string, Array<{ characterId: number }>> = {};
vi.mock('@/features/auth/linked-characters', () => ({
  listLinkedCharacters: vi.fn(async (userId: string) => linkedByUser[userId] ?? []),
}));

import { characterRow, getLiveDatasetOnView, type OwnerRow, readCharacterOwners } from './live-dataset-view';

beforeEach(() => {
  afterCalls.length = 0;
  getTypeNamesArgs.length = 0;
  for (const key of Object.keys(linkedByUser)) delete linkedByUser[key];
});

describe('characterRow', () => {
  it('builds the wire row, exposing the stamp as epoch ms', () => {
    const owner: OwnerRow = { id: 42, lastRefreshedAt: new Date('2026-06-28T12:00:00Z') };
    expect(characterRow(owner, { value: 1 })).toEqual({
      characterId: 42,
      data: { value: 1 },
      lastRefreshedAt: Date.parse('2026-06-28T12:00:00Z'),
    });
  });

  it('passes null data through and reads a never-synced stamp as null', () => {
    expect(characterRow({ id: 7, lastRefreshedAt: null }, null)).toEqual({
      characterId: 7,
      data: null,
      lastRefreshedAt: null,
    });
  });
});

describe('readCharacterOwners', () => {
  it('enumerates linked characters and reads data + per-id state in parallel', async () => {
    linkedByUser.u1 = [{ characterId: 1 }, { characterId: 2 }];
    let dataStarted = false;
    let stateStartedBeforeDataResolved = false;

    const readData = vi.fn(async (ids: number[]) => {
      dataStarted = true;
      await Promise.resolve();
      return new Map(ids.map((id) => [id, { n: id }]));
    });
    const readState = vi.fn(async (id: number) => {
      // If the data read has begun but not resolved when state reads start, they overlap.
      if (dataStarted) stateStartedBeforeDataResolved = true;
      return { lastRefreshedAt: id === 1 ? new Date('2026-06-28T10:00:00Z') : null };
    });

    const { owners, data } = await readCharacterOwners('u1', readData, readState);

    expect(readData).toHaveBeenCalledWith([1, 2]);
    expect(readState).toHaveBeenCalledTimes(2);
    expect(stateStartedBeforeDataResolved).toBe(true);
    expect(owners).toEqual([
      { id: 1, lastRefreshedAt: new Date('2026-06-28T10:00:00Z') },
      { id: 2, lastRefreshedAt: null },
    ]);
    expect(data.get(1)).toEqual({ n: 1 });
  });

  it('returns empty owners for a user with no linked characters', async () => {
    const { owners, data } = await readCharacterOwners('nobody', async () => new Map(), async () => null);
    expect(owners).toEqual([]);
    expect(data.size).toBe(0);
  });
});

describe('getLiveDatasetOnView', () => {
  it('builds rows from owners+data, schedules the refresh, and resolves deduped name ids', async () => {
    const refresh = vi.fn();
    const result = await getLiveDatasetOnView<{ ids: number[] }, { key: number; data: { ids: number[] } | null }>(
      'u1',
      {
        read: async () => ({
          owners: [
            { id: 10, lastRefreshedAt: null },
            { id: 20, lastRefreshedAt: null },
          ],
          data: new Map([
            [10, { ids: [100, 200] }],
            // 20 has no cached data (never synced) → row.data is null.
          ]),
        }),
        refresh,
        makeRow: (owner, data) => ({ key: owner.id, data }),
        // 100 appears twice across rows → must be deduped in the name pass.
        nameIds: (rows) => rows.flatMap((row) => row.data?.ids ?? []).concat(100),
      },
    );

    expect(result.rows).toEqual([
      { key: 10, data: { ids: [100, 200] } },
      { key: 20, data: null },
    ]);
    // Refresh scheduled via after() and (per the mock) invoked.
    expect(afterCalls).toHaveLength(1);
    expect(refresh).toHaveBeenCalledWith('u1');
    // Name ids deduped before the SDE pass.
    expect(getTypeNamesArgs).toHaveLength(1);
    expect([...getTypeNamesArgs[0]!].sort((a, b) => a - b)).toEqual([100, 200]);
    expect(result.names).toEqual({ '100': 'Type #100', '200': 'Type #200' });
  });

  it('resolves no names when the built rows reference none', async () => {
    const result = await getLiveDatasetOnView<unknown, { id: number }>('u1', {
      read: async () => ({ owners: [{ id: 1, lastRefreshedAt: null }], data: new Map() }),
      refresh: vi.fn(),
      makeRow: (owner) => ({ id: owner.id }),
      nameIds: () => [],
    });
    expect(result.names).toEqual({});
    expect(getTypeNamesArgs[0]).toEqual([]);
  });
});
