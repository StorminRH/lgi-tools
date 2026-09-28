import { describe, expect, it, vi } from 'vitest';
import type { EnumeratedOwner } from '@/platform/owner-sync';
import { buildCorpHoldingContext, type CorpProfile } from './context';
import { type CorpContextPort, type CorpContextRead, refreshCorpContextForUser } from './context-sync';
import { buildHoldingIndex, type CorpAssetItem, toHoldingNodes } from './placement';

const NOW = new Date('2026-09-28T12:00:00Z');
const CORP = 98000001;
const STATION = 60003760;
const STRUCTURE = 1000000000001;
const SYSTEM = 30000142;
const OFFICE = 1001;
const CAN = 3001;
const NEW_CAN = 3002;
const CAN_TYPE = 17366;

function item(
  itemId: number,
  locationId: number,
  locationType: CorpAssetItem['locationType'],
  locationFlag: string,
  typeId = 34,
): CorpAssetItem {
  return { itemId, typeId, locationId, locationType, locationFlag };
}

const tree = buildHoldingIndex([
  item(OFFICE, STATION, 'station', 'OfficeFolder', 27),
  item(CAN, OFFICE, 'item', 'CorpSAG2', CAN_TYPE),
  item(NEW_CAN, OFFICE, 'item', 'CorpSAG3', CAN_TYPE),
  item(2001, CAN, 'item', 'Unlocked'),
  item(2002, NEW_CAN, 'item', 'Unlocked'),
  item(STRUCTURE, SYSTEM, 'solar_system', 'AutoFit', 35825),
  item(2003, STRUCTURE, 'item', 'CorpDeliveries'),
]);

const priorProfile: CorpProfile = {
  hqStationId: null,
  divisionNames: {},
  containerNames: { [CAN]: 'Ore Can' },
  structureNames: {},
};

const fresh = (body: unknown): CorpContextRead => ({ kind: 'fresh', body });
const failed = (code: string): CorpContextRead => ({ kind: 'error', code });

function makePort(overrides: Partial<CorpContextPort> = {}): CorpContextPort {
  return {
    now: () => NOW,
    listMembers: vi.fn(async () => [member(1)]),
    vendToken: vi.fn(async () => 'token'),
    readRoles: vi.fn(async () => ['Director']),
    readCorporation: vi.fn(async () => fresh({ name: 'Corp', home_station_id: STATION })),
    readDivisions: vi.fn(async () => fresh({ hangar: [{ division: 2, name: 'Minerals' }] })),
    readMemberTracking: vi.fn(async () =>
      fresh([
        { character_id: 90001, base_id: STATION },
        { character_id: 90002 },
        { character_id: 90003, base_id: STATION },
      ]),
    ),
    readAssetNames: vi.fn(async (_corp: number, _token: string, ids: readonly number[]) =>
      fresh(ids.map((id) => ({ item_id: id, name: `Can ${id}` }))),
    ),
    readStructure: vi.fn(async () => fresh({ name: 'Jita Fort', solar_system_id: SYSTEM, owner_id: CORP })),
    currentContext: vi.fn(async () => buildCorpHoldingContext(CORP, toHoldingNodes(tree), priorProfile)),
    listLinkedMemberIds: vi.fn(async () => [90001, 90002]),
    readProfileState: vi.fn(async () => null),
    saveProfile: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    ...overrides,
  };
}

const member = (id: number, extra: Partial<EnumeratedOwner> = {}): EnumeratedOwner => ({
  characterId: id,
  corporationId: CORP,
  hasRefreshToken: true,
  missingScopes: [],
  ...extra,
});

describe('refreshCorpContextForUser', () => {
  it('saves the HQ, renamed divisions, linked members\' bases, and only the names it did not have', async () => {
    const port = makePort();

    const results = await refreshCorpContextForUser(port, 'u1');

    expect(results).toEqual([{ kind: 'succeeded', target: { ownerType: 'corporation', ownerId: CORP } }]);
    expect(port.readAssetNames).toHaveBeenCalledTimes(1);
    expect(port.readAssetNames).toHaveBeenCalledWith(CORP, 'token', [NEW_CAN]);
    expect(port.readStructure).toHaveBeenCalledWith(STRUCTURE, 'token');
    expect(port.saveProfile).toHaveBeenCalledWith(
      CORP,
      {
        hqStationId: STATION,
        divisionNames: { 2: 'Minerals' },
        containerNames: { [CAN]: 'Ore Can', [NEW_CAN]: `Can ${NEW_CAN}` },
        structureNames: { [STRUCTURE]: 'Jita Fort' },
      },
      [
        { characterId: 90001, baseId: STATION },
        { characterId: 90002, baseId: null },
      ],
      NOW,
    );
  });

  it('posts container ids in batches of one thousand', async () => {
    const cans = Array.from({ length: 1500 }, (_unused, i) => item(10_000 + i, OFFICE, 'item', 'CorpSAG1', CAN_TYPE));
    const contents = cans.map((can, i) => item(20_000 + i, can.itemId, 'item', 'Unlocked'));
    const wide = buildHoldingIndex([item(OFFICE, STATION, 'station', 'OfficeFolder', 27), ...cans, ...contents]);
    const port = makePort({
      currentContext: vi.fn(async () => buildCorpHoldingContext(CORP, toHoldingNodes(wide), null)),
    });

    await refreshCorpContextForUser(port, 'u1');

    const batches = vi.mocked(port.readAssetNames).mock.calls.map(([, , ids]) => ids.length);
    expect(batches).toEqual([1000, 500]);
    const saved = vi.mocked(port.saveProfile).mock.calls[0]![1];
    expect(Object.keys(saved.containerNames)).toHaveLength(1500);
    expect(saved.containerNames['10000']).toBe('Can 10000');
  });

  it('skips the pass and keeps the prior profile when a required read fails', async () => {
    const port = makePort({
      readDivisions: vi.fn(async () => failed('esi_server_error')),
    });

    const results = await refreshCorpContextForUser(port, 'u1');

    expect(results).toEqual([
      { kind: 'failed_retryable', target: { ownerType: 'corporation', ownerId: CORP }, code: 'esi_server_error' },
    ]);
    expect(port.saveProfile).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('skips the pass when a names batch fails', async () => {
    const port = makePort({ readAssetNames: vi.fn(async () => failed('esi_403')) });

    const results = await refreshCorpContextForUser(port, 'u1');

    expect(results[0]).toMatchObject({ kind: 'failed_permanent', code: 'esi_403' });
    expect(port.saveProfile).not.toHaveBeenCalled();
  });

  it('still saves when a structure name is refused, leaving that structure unnamed', async () => {
    const port = makePort({ readStructure: vi.fn(async () => failed('esi_403')) });

    await refreshCorpContextForUser(port, 'u1');

    const saved = vi.mocked(port.saveProfile).mock.calls[0]![1];
    expect(saved.structureNames).toEqual({});
    expect(saved.hqStationId).toBe(STATION);
  });

  it('makes no ESI call when the profile is fresh', async () => {
    const port = makePort({
      readProfileState: vi.fn(async () => ({ lastRefreshedAt: new Date('2026-09-28T11:30:00Z') })),
    });

    await refreshCorpContextForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.readCorporation).not.toHaveBeenCalled();
    expect(port.saveProfile).not.toHaveBeenCalled();
  });

  it('leaves a Director who has not reconnected for the new scopes out of the pass', async () => {
    const port = makePort({
      listMembers: vi.fn(async () => [member(1, { missingScopes: ['esi-corporations.track_members.v1'] })]),
    });

    await expect(refreshCorpContextForUser(port, 'u1')).resolves.toEqual([]);
    expect(port.readProfileState).not.toHaveBeenCalled();
    expect(port.readCorporation).not.toHaveBeenCalled();
  });

  it('reports needs_role and reads nothing when no member is a Director', async () => {
    const port = makePort({ readRoles: vi.fn(async () => ['Accountant']) });

    const results = await refreshCorpContextForUser(port, 'u1');

    expect(results[0]).toMatchObject({ kind: 'failed_permanent', code: 'needs_role' });
    expect(port.readCorporation).not.toHaveBeenCalled();
  });
});
