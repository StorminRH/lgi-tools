import { describe, expect, it, vi } from 'vitest';
import type { PagedOwnerReadResult } from '@/platform/owner-sync';
import { ownedDatasetPortFake, ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { refreshCharacterOwnedAssetsForUser, refreshOwnedAssetsForUser } from './refresh';
import type { OwnedAssetsPort } from './types';

const NOW = new Date('2026-06-28T12:00:00Z');
const CHAR_ASSETS_SCOPE = 'esi-assets.read_assets.v1';

function esiAsset(typeId: number, quantity = 1000) {
  return {
    item_id: 9_999,
    type_id: typeId,
    quantity,
    location_id: 60003760,
    location_type: 'station',
    location_flag: 'Hangar',
    is_singleton: false,
  };
}

const makePort = (overrides: Partial<OwnedAssetsPort> = {}): OwnedAssetsPort =>
  ownedDatasetPortFake(NOW, overrides);

const CHARACTER_1 = { ownerType: 'character', ownerId: 1 } as const;
const CORP_5000 = { ownerType: 'corporation', ownerId: 5000 } as const;
const readOwners = (port: OwnedAssetsPort) => vi.mocked(port.read).mock.calls.map(([, owner]) => owner);

describe('refreshOwnedAssetsForUser — character path', () => {
  it('makes no token vend and no ESI call while the stored answer is unexpired (the store is the gate)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      isDue: vi.fn(async () => false),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.read).not.toHaveBeenCalled();
    expect(port.save).not.toHaveBeenCalled();
  });

  it('fetches and saves a stale owner, aggregating + dropping item_id via the projection', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSyncState: vi.fn(async () => null),
      read: vi.fn(
        async (): Promise<PagedOwnerReadResult> => ({
          kind: 'fresh',
          items: [esiAsset(34, 1000), esiAsset(34, 500)],
          etags: ['"e1"'],
          responseHeaders: [],
        }),
      ),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.read).toHaveBeenCalledWith(expect.anything(), CHARACTER_1, 'token');
    const save = vi.mocked(port.save).mock.calls[0]!;
    expect(save[0]).toEqual(CHARACTER_1);
    expect(save[1]).toEqual([
      { type_id: 34, quantity: 1500, location_id: 60003760, location_flag: 'Hangar', location_type: 'station' },
    ]);
    expect(save[2]).toEqual(['"e1"']);
  });

  it('only stamps freshness on an unchanged answer (no row rewrite)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null })),
      read: vi.fn(async (): Promise<PagedOwnerReadResult> => ({ kind: 'unchanged' })),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.read).toHaveBeenCalledWith(expect.anything(), CHARACTER_1, 'token');
    expect(port.stampFresh).toHaveBeenCalledOnce();
    expect(port.save).not.toHaveBeenCalled();
  });

  it('refreshes several stale character owners (the parallel pass saves each one)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1), ownerFixture(2), ownerFixture(3)]),
      readSyncState: vi.fn(async () => null),
      read: vi.fn(
        async (): Promise<PagedOwnerReadResult> => ({
          kind: 'fresh',
          items: [esiAsset(34)],
          etags: [],
          responseHeaders: [],
        }),
      ),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    const saved = vi
      .mocked(port.save)
      .mock.calls.map(([owner]) => owner.ownerId)
      .sort((a, b) => a - b);
    expect(saved).toEqual([1, 2, 3]);
  });

  it('skips a character missing the assets scope', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1, { missingScopes: [CHAR_ASSETS_SCOPE] })]),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.isDue).not.toHaveBeenCalled();
    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.read).not.toHaveBeenCalled();
  });
});

describe('refreshOwnedAssetsForUser — corporation path', () => {
  it('reads corp assets once, with a Director member token (preferred vend)', async () => {
    const members = [ownerFixture(1, { corporationId: 5000 }), ownerFixture(2, { corporationId: 5000 })];
    const port = makePort({
      listCharacters: vi.fn(async () => members),
      readSyncState: vi.fn(async () => null),
      vendToken: vi.fn(async (id: number) => `token-${id}`),
      readRoles: vi.fn(async (id: number) => (id === 2 ? ['Director'] : ['Accountant'])),
      read: vi.fn(
        async (): Promise<PagedOwnerReadResult> => ({
          kind: 'fresh',
          items: [esiAsset(99)],
          etags: [],
          responseHeaders: [],
        }),
      ),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.read).toHaveBeenCalledWith(expect.anything(), CORP_5000, 'token-2');
    const corpSave = vi
      .mocked(port.save)
      .mock.calls.find(([owner]) => owner.ownerType === 'corporation');
    expect(corpSave?.[0]).toEqual({ ownerType: 'corporation', ownerId: 5000 });
  });

  it('skips a corp gracefully when no member holds the Director role', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 })]),
      readSyncState: vi.fn(async () => null),
      readRoles: vi.fn(async () => ['Accountant']),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(readOwners(port).find((owner) => owner.ownerType === 'corporation')).toBeUndefined();
  });

  it('reads no corp roles while the corp answer is unexpired (the corp gate is the store too)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 })]),
      isDue: vi.fn(async () => false),
      readRoles: vi.fn(async () => ['Director']),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.readRoles).not.toHaveBeenCalled();
  });
});

describe('refreshCharacterOwnedAssetsForUser — the board variant', () => {
  it('refreshes personal hangars and never reads roles or corporation assets, even for a Director', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1, { corporationId: 5000 }), ownerFixture(2, { corporationId: 5000 })]),
      readSyncState: vi.fn(async () => null),
      vendToken: vi.fn(async (id: number) => `token-${id}`),
      readRoles: vi.fn(async () => ['Director']),
      read: vi.fn(
        async (): Promise<PagedOwnerReadResult> => ({ kind: 'fresh', items: [esiAsset(34)], etags: [], responseHeaders: [] }),
      ),
    });

    await refreshCharacterOwnedAssetsForUser(port, 'u1');

    expect(readOwners(port).sort((a, b) => a.ownerId - b.ownerId)).toEqual([
      CHARACTER_1,
      { ownerType: 'character', ownerId: 2 },
    ]);
    expect(port.readRoles).not.toHaveBeenCalled();
    expect(vi.mocked(port.save).mock.calls.map(([owner]) => owner)).toEqual([
      { ownerType: 'character', ownerId: 1 },
      { ownerType: 'character', ownerId: 2 },
    ]);
  });

  it('still honours the assets scope and the store gate', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1, { missingScopes: [CHAR_ASSETS_SCOPE] }), ownerFixture(2)]),
      isDue: vi.fn(async () => false),
    });

    await refreshCharacterOwnedAssetsForUser(port, 'u1');

    expect(port.read).not.toHaveBeenCalled();
    expect(port.vendToken).not.toHaveBeenCalled();
  });
});
