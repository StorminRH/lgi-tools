import { describe, expect, it, vi } from 'vitest';
import { refreshOwnedBlueprintsForUser } from './refresh';
import type { EnumeratedOwner, PagedOwnerReadResult, PagedOwnerSyncState } from '@/lib/owner-sync';
import type { OwnedBlueprintsPort } from './types';

const NOW = new Date('2026-06-27T12:00:00Z');
const CHAR_BP_SCOPE = 'esi-characters.read_blueprints.v1';

// A valid ESI blueprint element — item_id is present and must be dropped by the
// projection, so the saved row never carries it.
function esiBlueprint(typeId: number) {
  return {
    type_id: typeId,
    material_efficiency: 10,
    time_efficiency: 20,
    runs: -1,
    quantity: -1,
    location_id: 60003760,
    location_flag: 'Hangar',
    item_id: 9_999,
  };
}

function makePort(overrides: Partial<OwnedBlueprintsPort> = {}): OwnedBlueprintsPort {
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

const fresh = (): PagedOwnerSyncState => ({ lastRefreshedAt: new Date('2026-06-27T11:30:00Z'), pageEtags: [] });

describe('refreshOwnedBlueprintsForUser — character path', () => {
  it('makes no token vend and no ESI call when the owner is fresh (the staleness gate)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => fresh()),
    });

    await refreshOwnedBlueprintsForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.read).not.toHaveBeenCalled();
    expect(port.save).not.toHaveBeenCalled();
  });

  it('fetches and saves a stale owner, dropping item_id via the projection', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => null), // never synced → stale
      read: vi.fn(
        async (): Promise<PagedOwnerReadResult> => ({
          kind: 'fresh',
          items: [esiBlueprint(34)],
          etags: ['"e1"'],
          responseHeaders: [],
        }),
      ),
    });

    await refreshOwnedBlueprintsForUser(port, 'u1');

    expect(port.read).toHaveBeenCalledWith('/characters/1/blueprints/', 'token', []);
    const save = vi.mocked(port.save).mock.calls[0]!;
    expect(save[0]).toEqual({ ownerType: 'character', ownerId: 1 });
    expect(save[1]).toEqual([
      {
        type_id: 34,
        material_efficiency: 10,
        time_efficiency: 20,
        runs: -1,
        quantity: -1,
        location_id: 60003760,
        location_flag: 'Hangar',
      },
    ]);
    expect(save[2]).toEqual(['"e1"']);
  });

  it('replays held etags and only stamps freshness on a 304 (no row rewrite)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null, pageEtags: ['"held"'] })),
      read: vi.fn(async (): Promise<PagedOwnerReadResult> => ({ kind: 'unchanged' })),
    });

    await refreshOwnedBlueprintsForUser(port, 'u1');

    expect(port.read).toHaveBeenCalledWith('/characters/1/blueprints/', 'token', ['"held"']);
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
          items: [esiBlueprint(34)],
          etags: [],
          responseHeaders: [],
        }),
      ),
    });

    await refreshOwnedBlueprintsForUser(port, 'u1');

    const saved = vi
      .mocked(port.save)
      .mock.calls.map(([owner]) => owner.ownerId)
      .sort((a, b) => a - b);
    expect(saved).toEqual([1, 2, 3]);
  });

  it('skips a character missing the blueprints scope', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1, { missingScopes: [CHAR_BP_SCOPE] })]),
    });

    await refreshOwnedBlueprintsForUser(port, 'u1');

    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.read).not.toHaveBeenCalled();
  });
});

describe('refreshOwnedBlueprintsForUser — corporation path', () => {
  it('reads corp blueprints once, with a Director member token (preferred vend)', async () => {
    const members = [character(1, { corporationId: 5000 }), character(2, { corporationId: 5000 })];
    const port = makePort({
      listCharacters: vi.fn(async () => members),
      readSyncState: vi.fn(async () => null), // stale
      vendToken: vi.fn(async (id: number) => `token-${id}`),
      readRoles: vi.fn(async (id: number) => (id === 2 ? ['Director'] : ['Accountant'])),
      read: vi.fn(
        async (): Promise<PagedOwnerReadResult> => ({
          kind: 'fresh',
          items: [esiBlueprint(99)],
          etags: [],
          responseHeaders: [],
        }),
      ),
    });

    await refreshOwnedBlueprintsForUser(port, 'u1');

    expect(port.read).toHaveBeenCalledWith('/corporations/5000/blueprints/', 'token-2', []);
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

    await refreshOwnedBlueprintsForUser(port, 'u1');

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

    await refreshOwnedBlueprintsForUser(port, 'u1');

    expect(port.readRoles).not.toHaveBeenCalled();
  });
});
