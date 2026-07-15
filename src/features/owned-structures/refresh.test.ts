import { describe, expect, it, vi } from 'vitest';
import { refreshCorpStructuresForUser } from './refresh';
import type { CorpStructuresPort, CorpStructuresReadResult, RefreshCorpMember } from './types';

const NOW = new Date('2026-06-28T12:00:00Z');
const STRUCTURES_SCOPE = 'esi-corporations.read_structures.v1';

// A valid ESI corp-structures element — services/state are present and must be
// dropped by the projection, so the saved row never carries them.
function esiStructure(structureId: number, extra: Record<string, unknown> = {}) {
  return {
    structure_id: structureId,
    type_id: 35832, // Astrahus
    system_id: 30000142, // Jita
    name: `Struct ${structureId}`,
    services: [{ name: 'Manufacturing', state: 'online' }],
    state: 'shield_vulnerable',
    ...extra,
  };
}

function makePort(overrides: Partial<CorpStructuresPort> = {}): CorpStructuresPort {
  return {
    now: () => NOW,
    isSharingEnabled: vi.fn(async () => true),
    listMembers: vi.fn(async () => []),
    vendToken: vi.fn(async () => 'token'),
    readRoles: vi.fn(async () => ['Station_Manager']),
    readStructures: vi.fn(
      async (): Promise<CorpStructuresReadResult> => ({ kind: 'fresh', items: [], etags: [] }),
    ),
    readSyncState: vi.fn(async () => null),
    saveStructures: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    ...overrides,
  };
}

const member = (id: number, extra: Partial<RefreshCorpMember> = {}): RefreshCorpMember => ({
  characterId: id,
  corporationId: 5000,
  hasRefreshToken: true,
  missingScopes: [],
  ...extra,
});

const freshState = () => ({ lastRefreshedAt: new Date('2026-06-28T11:30:00Z'), pageEtags: [] });

describe('refreshCorpStructuresForUser', () => {
  it('makes no vend, roles read, or ESI call when the corp is fresh (the shared staleness gate)', async () => {
    // The "re-view within the 1h window makes NO ESI call" proof, and the shared
    // dedup: the stamp is on the corp row, so ANY member's view inside the window is
    // a no-op.
    const port = makePort({
      listMembers: vi.fn(async () => [member(1)]),
      readSyncState: vi.fn(async () => freshState()),
    });

    await refreshCorpStructuresForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.readRoles).not.toHaveBeenCalled();
    expect(port.readStructures).not.toHaveBeenCalled();
    expect(port.saveStructures).not.toHaveBeenCalled();
  });

  it('dispatches nothing for a corp that has not opted in to sharing (the consent gate)', async () => {
    // The load-bearing retrofit: sharing OFF short-circuits in the engine BEFORE the
    // staleness read, the token vend, the roles read, and any ESI fetch or save —
    // zero ESI, zero rows for a non-opted-in corp.
    const port = makePort({
      isSharingEnabled: vi.fn(async () => false),
      listMembers: vi.fn(async () => [member(1)]),
      readSyncState: vi.fn(async () => null), // would be stale → would pull if not gated
    });

    await refreshCorpStructuresForUser(port, 'u1');

    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.readRoles).not.toHaveBeenCalled();
    expect(port.readStructures).not.toHaveBeenCalled();
    expect(port.saveStructures).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('reads with a Station_Manager member token and saves the shared corp-keyed row', async () => {
    const port = makePort({
      listMembers: vi.fn(async () => [member(1), member(2)]),
      readSyncState: vi.fn(async () => null), // never synced → stale
      vendToken: vi.fn(async (id: number) => `token-${id}`),
      readRoles: vi.fn(async (id: number) => (id === 2 ? ['Station_Manager'] : ['Accountant'])),
      readStructures: vi.fn(
        async (): Promise<CorpStructuresReadResult> => ({
          kind: 'fresh',
          items: [esiStructure(1002), esiStructure(1001)],
          etags: ['"e1"'],
        }),
      ),
    });

    await refreshCorpStructuresForUser(port, 'u1');

    expect(port.readStructures).toHaveBeenCalledWith(5000, 'token-2', []);
    const save = vi.mocked(port.saveStructures).mock.calls[0]!;
    // Owner key is the corporation ALONE — no userId reaches the save (the shared store).
    expect(save[0]).toBe(5000);
    // Sorted by structure id; services/state stripped by the projection.
    expect(save[1]).toEqual([
      { structure_id: 1001, type_id: 35832, system_id: 30000142, name: 'Struct 1001' },
      { structure_id: 1002, type_id: 35832, system_id: 30000142, name: 'Struct 1002' },
    ]);
    expect(save[2]).toEqual(['"e1"']);
  });

  it('skips a corp with no Station_Manager member — never clobbering the shared board', async () => {
    const port = makePort({
      listMembers: vi.fn(async () => [member(1)]),
      readSyncState: vi.fn(async () => null),
      readRoles: vi.fn(async () => ['Accountant']), // not a Station_Manager
    });

    await refreshCorpStructuresForUser(port, 'u1');

    expect(port.readStructures).not.toHaveBeenCalled();
    expect(port.saveStructures).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('replays held etags and only stamps freshness on a 304 (no row rewrite)', async () => {
    const port = makePort({
      listMembers: vi.fn(async () => [member(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null, pageEtags: ['"held"'] })),
      readStructures: vi.fn(async (): Promise<CorpStructuresReadResult> => ({ kind: 'unchanged' })),
    });

    await refreshCorpStructuresForUser(port, 'u1');

    expect(port.readStructures).toHaveBeenCalledWith(5000, 'token', ['"held"']);
    expect(port.stampFresh).toHaveBeenCalledWith(5000);
    expect(port.saveStructures).not.toHaveBeenCalled();
  });

  it('treats a mid-read 403 as a non-destructive skip', async () => {
    const port = makePort({
      listMembers: vi.fn(async () => [member(1)]),
      readSyncState: vi.fn(async () => null),
      readStructures: vi.fn(
        async (): Promise<CorpStructuresReadResult> => ({ kind: 'error', code: 'esi_403' }),
      ),
    });

    await refreshCorpStructuresForUser(port, 'u1');

    expect(port.readStructures).toHaveBeenCalledWith(5000, 'token', []);
    expect(port.saveStructures).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('writes the same corp-keyed row no matter which member triggers it (the shared store)', async () => {
    const make = () =>
      makePort({
        listMembers: vi.fn(async (userId: string) => [member(userId === 'userA' ? 1 : 2)]),
        readSyncState: vi.fn(async () => null),
        readStructures: vi.fn(
          async (): Promise<CorpStructuresReadResult> => ({
            kind: 'fresh',
            items: [esiStructure(7001)],
            etags: [],
          }),
        ),
      });

    const portA = make();
    await refreshCorpStructuresForUser(portA, 'userA');
    const portB = make();
    await refreshCorpStructuresForUser(portB, 'userB');

    // userId never reaches the owner key — both users write corp 5000's shared row.
    expect(vi.mocked(portA.saveStructures).mock.calls[0]![0]).toBe(5000);
    expect(vi.mocked(portB.saveStructures).mock.calls[0]![0]).toBe(5000);
  });

  it("syncs each of the user's member corps once", async () => {
    const port = makePort({
      listMembers: vi.fn(async () => [
        member(1, { corporationId: 5000 }),
        member(2, { corporationId: 6000 }),
      ]),
      readSyncState: vi.fn(async () => null),
      readStructures: vi.fn(
        async (): Promise<CorpStructuresReadResult> => ({ kind: 'fresh', items: [esiStructure(1)], etags: [] }),
      ),
    });

    await refreshCorpStructuresForUser(port, 'u1');

    const corps = vi
      .mocked(port.saveStructures)
      .mock.calls.map(([corporationId]) => corporationId)
      .sort((a, b) => a - b);
    expect(corps).toEqual([5000, 6000]);
  });

  it('skips a member missing the structures scope (the corp does not sync through them)', async () => {
    const port = makePort({
      listMembers: vi.fn(async () => [member(1, { missingScopes: [STRUCTURES_SCOPE] })]),
      readSyncState: vi.fn(async () => null),
    });

    await refreshCorpStructuresForUser(port, 'u1');

    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.readStructures).not.toHaveBeenCalled();
  });
});
