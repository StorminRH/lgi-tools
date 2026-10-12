import { beforeEach, describe, expect, it, vi } from 'vitest';

const afterCalls: Array<() => void> = [];
vi.mock('next/server', () => ({
  after: (fn: () => void) => {
    afterCalls.push(fn);
    fn();
  },
}));

const nameRecordArgs: number[][] = [];
vi.mock('@/data/eve-data/queries', () => ({
  getTypeNameRecord: vi.fn(async (ids: Iterable<number>) => {
    const requested = [...ids];
    nameRecordArgs.push(requested);
    return Object.fromEntries(requested.map((id) => [String(id), `Type #${id}`]));
  }),
}));

const linkedByUser: Record<string, Array<{ characterId: number }>> = {};
vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: vi.fn(async (userId: string) => linkedByUser[userId] ?? []),
}));

const store = vi.hoisted(() => ({
  isDue: vi.fn(async (_keys: unknown[]) => false),
  health: vi.fn(async (_userId: string) => [] as unknown[]),
}));
vi.mock('@/data/esi-store', () => ({ isDue: store.isDue }));
vi.mock('./owner-sync-port', () => ({ listCharactersWithHealth: store.health }));

import type { EsiStoreKey } from '@/data/esi-store';
import { characterRow, getLiveDatasetOnView, type OwnerRow, readCharacterOwners, refreshDue } from './live-dataset-view';

const KEY: EsiStoreKey = { route: '/characters/{character_id}/industry/jobs/', holder: { kind: 'character', id: 10 } };

beforeEach(() => {
  afterCalls.length = 0;
  nameRecordArgs.length = 0;
  for (const key of Object.keys(linkedByUser)) delete linkedByUser[key];
  store.isDue.mockReset().mockResolvedValue(false);
  store.health.mockReset().mockResolvedValue([]);
});

describe('refreshDue', () => {
  it('asks the store about the keys the refresh would check for the linked characters', async () => {
    const owners = [{ characterId: 10, corporationId: null, hasRefreshToken: true, missingScopes: [] }];
    store.health.mockResolvedValue(owners);
    store.isDue.mockResolvedValue(true);
    const dueKeys = vi.fn(() => [KEY]);
    await expect(refreshDue('u1', dueKeys)).resolves.toBe(true);
    expect(dueKeys).toHaveBeenCalledExactlyOnceWith(owners);
    expect(store.isDue).toHaveBeenCalledExactlyOnceWith([KEY]);
  });
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
  it('reads data and one batched state map concurrently, keying owners by id in roster order', async () => {
    linkedByUser.u1 = [{ characterId: 1 }, { characterId: 2 }, { characterId: 3 }];
    const pendingData = Promise.withResolvers<Map<number, { n: number }>>();
    const readData = vi.fn((_ids: number[]) => pendingData.promise);
    const readStates = vi.fn(async (_ids: number[]) => new Map([
      [3, { lastRefreshedAt: new Date('2026-06-28T11:00:00Z') }],
      [1, { lastRefreshedAt: new Date('2026-06-28T10:00:00Z') }],
    ]));

    const read = readCharacterOwners('u1', readData, readStates);
    await vi.waitFor(() => expect(readData).toHaveBeenCalledExactlyOnceWith([1, 2, 3]));
    expect(readStates).toHaveBeenCalledExactlyOnceWith([1, 2, 3]);
    pendingData.resolve(new Map([[1, { n: 1 }]]));
    const { owners, data } = await read;

    expect(owners).toEqual([
      { id: 1, lastRefreshedAt: new Date('2026-06-28T10:00:00Z') },
      { id: 2, lastRefreshedAt: null },
      { id: 3, lastRefreshedAt: new Date('2026-06-28T11:00:00Z') },
    ]);
    expect(data.get(1)).toEqual({ n: 1 });
  });

  it('returns empty owners for a user with no linked characters', async () => {
    const { owners, data } = await readCharacterOwners('nobody', async () => new Map(), async () => new Map());
    expect(owners).toEqual([]);
    expect(data.size).toBe(0);
  });
});

describe('getLiveDatasetOnView', () => {
  it('builds rows from owners+data, schedules the refresh, says whether it will reach ESI, and resolves the name ids the rows reference', async () => {
    const refresh = vi.fn();
    const owners = [{ characterId: 10, corporationId: null, hasRefreshToken: true, missingScopes: [] }];
    store.health.mockResolvedValue(owners);
    store.isDue.mockResolvedValue(true);
    const dueKeys = vi.fn(() => [KEY]);
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
          ]),
        }),
        refresh,
        dueKeys,
        makeRow: (owner, data) => ({ key: owner.id, data }),
        nameIds: (rows) => rows.flatMap((row) => row.data?.ids ?? []).concat(100),
      },
    );

    expect(result.rows).toEqual([
      { key: 10, data: { ids: [100, 200] } },
      { key: 20, data: null },
    ]);
    expect(result.refreshing).toBe(true);
    expect(dueKeys).toHaveBeenCalledExactlyOnceWith('u1', owners);
    expect(store.isDue).toHaveBeenCalledExactlyOnceWith([KEY]);
    expect(afterCalls).toHaveLength(1);
    expect(refresh).toHaveBeenCalledWith('u1');
    expect(nameRecordArgs).toEqual([[100, 200, 100]]);
    expect(result.names).toEqual({ '100': 'Type #100', '200': 'Type #200' });
  });

  it('resolves no names when the built rows reference none, and is not refreshing while every answer stands', async () => {
    const result = await getLiveDatasetOnView<unknown, { id: number }>('u1', {
      read: async () => ({ owners: [{ id: 1, lastRefreshedAt: null }], data: new Map() }),
      refresh: vi.fn(),
      dueKeys: () => [],
      makeRow: (owner) => ({ id: owner.id }),
      nameIds: () => [],
    });
    expect(result.names).toEqual({});
    expect(result.refreshing).toBe(false);
    expect(nameRecordArgs).toEqual([[]]);
  });
});
