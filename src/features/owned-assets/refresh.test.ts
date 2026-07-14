import { describe, expect, it, vi } from 'vitest';
import type { EnumeratedOwner, PagedOwnerReadResult, PagedOwnerSyncState } from '@/lib/owner-sync';
import { refreshOwnedAssetsForUser } from './refresh';
import type { OwnedAssetsPort } from './types';

const NOW = new Date('2026-06-28T12:00:00Z');
const CHAR_ASSETS_SCOPE = 'esi-assets.read_assets.v1';

// A valid ESI asset element — item_id / is_singleton are present and must be
// dropped by the projection, so the saved row never carries them.
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

function makePort(overrides: Partial<OwnedAssetsPort> = {}): OwnedAssetsPort {
  return {
    now: () => NOW,
    listCharacters: vi.fn(async () => []),
    vendToken: vi.fn(async () => 'token'),
    readRoles: vi.fn(async () => []),
    read: vi.fn(
      async (): Promise<PagedOwnerReadResult> => ({
        kind: 'fresh',
        items: [],
        etags: [],
        responseHeaders: [],
      }),
    ),
    readSyncState: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    ...overrides,
  };
}

const character = (id: number, extra: Partial<EnumeratedOwner> = {}): EnumeratedOwner => ({
  characterId: id,
  corporationId: null,
  hasRefreshToken: true,
  missingScopes: [],
  ...extra,
});

const fresh = (): PagedOwnerSyncState => ({ lastRefreshedAt: new Date('2026-06-28T11:30:00Z'), pageEtags: [] });

describe('refreshOwnedAssetsForUser — character path', () => {
  it('makes no token vend and no ESI call when the owner is fresh (the staleness gate)', async () => {
    // The "re-view within the 1h window makes NO ESI call" proof: a fresh owner
    // never vends a token, never reads assets, never writes.
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => fresh()),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.read).not.toHaveBeenCalled();
    expect(port.save).not.toHaveBeenCalled();
  });

  it('fetches and saves a stale owner, aggregating + dropping item_id via the projection', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => null), // never synced → stale
      read: vi.fn(
        async (): Promise<PagedOwnerReadResult> => ({
          // Two stacks of the same type in the same hangar → one summed row.
          kind: 'fresh',
          items: [esiAsset(34, 1000), esiAsset(34, 500)],
          etags: ['"e1"'],
          responseHeaders: [],
        }),
      ),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.read).toHaveBeenCalledWith('/characters/1/assets/', 'token', []);
    const save = vi.mocked(port.save).mock.calls[0]!;
    expect(save[0]).toEqual({ ownerType: 'character', ownerId: 1 });
    expect(save[1]).toEqual([
      { type_id: 34, quantity: 1500, location_id: 60003760, location_flag: 'Hangar', location_type: 'station' },
    ]);
    expect(save[2]).toEqual(['"e1"']);
  });

  it('replays held etags and only stamps freshness on a 304 (no row rewrite)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null, pageEtags: ['"held"'] })),
      read: vi.fn(async (): Promise<PagedOwnerReadResult> => ({ kind: 'unchanged' })),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.read).toHaveBeenCalledWith('/characters/1/assets/', 'token', ['"held"']);
    expect(port.stampFresh).toHaveBeenCalledOnce();
    expect(port.save).not.toHaveBeenCalled();
  });

  it('refreshes several stale character owners (the parallel pass saves each one)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1), character(2), character(3)]),
      readSyncState: vi.fn(async () => null), // all stale
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
      listCharacters: vi.fn(async () => [character(1, { missingScopes: [CHAR_ASSETS_SCOPE] })]),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.read).not.toHaveBeenCalled();
  });
});

describe('refreshOwnedAssetsForUser — corporation path', () => {
  it('reads corp assets once, with a Director member token (preferred vend)', async () => {
    const members = [character(1, { corporationId: 5000 }), character(2, { corporationId: 5000 })];
    const port = makePort({
      listCharacters: vi.fn(async () => members),
      readSyncState: vi.fn(async () => null), // stale
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

    expect(port.read).toHaveBeenCalledWith('/corporations/5000/assets/', 'token-2', []);
    const corpSave = vi
      .mocked(port.save)
      .mock.calls.find(([owner]) => owner.ownerType === 'corporation');
    expect(corpSave?.[0]).toEqual({ ownerType: 'corporation', ownerId: 5000 });
  });

  it('skips a corp gracefully when no member holds the Director role', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1, { corporationId: 5000 })]),
      readSyncState: vi.fn(async () => null),
      readRoles: vi.fn(async () => ['Accountant']),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    const corpRead = vi
      .mocked(port.read)
      .mock.calls.find(([path]) => path.includes('/corporations/'));
    expect(corpRead).toBeUndefined();
  });

  it('reads no corp roles when the corp is fresh (the corp staleness gate)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1, { corporationId: 5000 })]),
      readSyncState: vi.fn(async () => fresh()), // both char + corp owner fresh
      readRoles: vi.fn(async () => ['Director']),
    });

    await refreshOwnedAssetsForUser(port, 'u1');

    expect(port.readRoles).not.toHaveBeenCalled();
  });
});
