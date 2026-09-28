import { describe, expect, it } from 'vitest';
import type { CorpHoldingContext } from '@/data/corp-holdings/placement';
import type { AssetHolding, OwnedAssetMap, OwnedAssetSummary } from './asset-map';
import { buildOwnedAssetDetail, collectAssetNameIds } from './detail';

const CORP = 98000001;
const STATION = 60003760;
const STRUCTURE = 1_036_000_000_001;
const CAN = 3001;
const CAN_TYPE = 17366;

type CharacterHolding = Extract<AssetHolding, { ownerType: 'character' }>;

const holding = (over: Partial<CharacterHolding> = {}): AssetHolding => ({
  ownerType: 'character',
  ownerId: 1,
  locationId: STATION,
  locationFlag: 'Hangar',
  locationType: 'station',
  quantity: 100,
  ...over,
});

const corpHolding = (placement: Extract<AssetHolding, { ownerType: 'corporation' }>['placement'], quantity = 40): AssetHolding => ({
  ownerType: 'corporation',
  ownerId: CORP,
  placement,
  quantity,
});

const summary = (heldBy: AssetHolding[]): OwnedAssetSummary => ({
  ownedQty: heldBy.reduce((sum, h) => sum + h.quantity, 0),
  heldBy,
});

const context: CorpHoldingContext = {
  corporationId: CORP,
  index: { interiors: new Map() },
  hq: { kind: 'known', value: STATION },
  divisionNames: { 2: 'Minerals' },
  containerNames: new Map([[CAN, 'Ore Can']]),
  structureNames: new Map([[STRUCTURE, 'Jita Fort']]),
};
const contexts = new Map([[CORP, context]]);
const noContexts = new Map<number, CorpHoldingContext>();

const fmt = (name: string) => `F:${name}`;

describe('collectAssetNameIds', () => {
  it('collects owners always + only resolvable locations (NPC station, solar system)', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerId: 5, locationId: 60003760, locationType: 'station' })])],
      [35, summary([holding({ ownerId: 5, locationId: 30000142, locationType: 'solar_system' })])],
      [36, summary([holding({ ownerId: 9, locationId: 1_036_000_000_001, locationType: 'station' })])],
      [37, summary([holding({ ownerId: 9, locationId: 1_400_000_000_001, locationType: 'item' })])],
      [38, summary([holding({ ownerId: 9, locationId: 12_345, locationType: 'other' })])],
    ]);
    const ids = collectAssetNameIds(map, noContexts);
    expect([...ids].sort((a, b) => a - b)).toEqual([5, 9, 30000142, 60003760]);
    expect(ids).not.toContain(1_036_000_000_001);
    expect(ids).not.toContain(1_400_000_000_001);
    expect(ids).not.toContain(12_345);
  });

  it('collects the corp, its NPC station root, and an unnamed container type for corp holdings', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([corpHolding({ kind: 'hangar', rootId: STATION, division: 1, containers: [{ itemId: 3999, typeId: CAN_TYPE }] })])],
      [35, summary([corpHolding({ kind: 'hangar', rootId: STRUCTURE, division: 2, containers: [{ itemId: CAN, typeId: CAN_TYPE }] })])],
    ]);
    expect([...collectAssetNameIds(map, contexts)].sort((a, b) => a - b)).toEqual([CAN_TYPE, STATION, CORP]);
  });

  it('is empty for an empty map', () => {
    expect(collectAssetNameIds(new Map(), noContexts)).toEqual([]);
  });
});

describe('buildOwnedAssetDetail', () => {
  it('resolves owner + NPC-station names and applies the station formatter', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerId: 5, locationId: 60003760, locationFlag: 'Hangar', quantity: 250 })])],
    ]);
    const names = { '5': 'Alice', '60003760': 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' };
    expect(buildOwnedAssetDetail(map, names, fmt, noContexts)).toEqual([
      {
        typeId: 34,
        ownedQty: 250,
        heldBy: [
          {
            ownerType: 'character',
            ownerName: 'Alice',
            locationName: 'F:Jita IV - Moon 4 - Caldari Navy Assembly Plant',
            locationFlag: '',
            containerName: null,
            quantity: 250,
          },
        ],
      },
    ]);
  });

  it('labels a corp holding the way the client does: structure, division, container', () => {
    const map: OwnedAssetMap = new Map([
      [
        34,
        summary([
          corpHolding({ kind: 'hangar', rootId: STRUCTURE, division: 2, containers: [{ itemId: CAN, typeId: CAN_TYPE }] }, 40),
          corpHolding({ kind: 'deliveries', rootId: STATION, containers: [] }, 2),
          corpHolding({ kind: 'hangar', rootId: STATION, division: 3, containers: [{ itemId: 3999, typeId: CAN_TYPE }] }, 1),
        ]),
      ],
    ]);
    const names = {
      [CORP]: 'Test Corp',
      [STATION]: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      [CAN_TYPE]: 'Station Container',
    };
    expect(buildOwnedAssetDetail(map, names, fmt, contexts)[0]!.heldBy).toEqual([
      {
        ownerType: 'corporation',
        ownerName: 'Test Corp',
        locationName: 'Jita Fort',
        locationFlag: 'Minerals',
        containerName: 'Ore Can',
        quantity: 40,
      },
      {
        ownerType: 'corporation',
        ownerName: 'Test Corp',
        locationName: 'F:Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        locationFlag: 'Deliveries',
        containerName: null,
        quantity: 2,
      },
      {
        ownerType: 'corporation',
        ownerName: 'Test Corp',
        locationName: 'F:Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        locationFlag: '3rd Division',
        containerName: 'Station Container',
        quantity: 1,
      },
    ]);
  });

  it('labels a corp holding with default names when no context was supplied for its corp', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([corpHolding({ kind: 'hangar', rootId: STRUCTURE, division: 2, containers: [] })])],
    ]);
    expect(buildOwnedAssetDetail(map, {}, fmt, noContexts)[0]!.heldBy[0]).toEqual({
      ownerType: 'corporation',
      ownerName: `Corporation ${CORP}`,
      locationName: 'Upwell structure',
      locationFlag: '2nd Division',
      containerName: null,
      quantity: 40,
    });
  });

  it('degrades a structure-floor station id to a generic label without the formatter', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 1_036_000_000_001, locationFlag: 'Hangar', locationType: 'station' })])],
    ]);
    const [entry] = buildOwnedAssetDetail(map, {}, fmt, noContexts);
    expect(entry!.heldBy[0]!.locationName).toBe('Upwell structure');
    expect(entry!.heldBy[0]!.locationFlag).toBe('');
  });

  it('names the kind of nested parent from the location flag, with a friendly corp division', () => {
    const nested = (flag: string) =>
      summary([holding({ locationId: 1_053_000_000_001, locationFlag: flag, locationType: 'item' })]);
    const map: OwnedAssetMap = new Map([
      [1, nested('CorpSAG4')],
      [2, nested('Hangar')],
      [3, nested('Cargo')],
      [4, nested('HiSlot0')],
      [5, nested('Unlocked')],
      [6, nested('SomethingNew')],
    ]);
    const byType = new Map(buildOwnedAssetDetail(map, {}, fmt, noContexts).map((e) => [e.typeId, e.heldBy[0]]));
    expect(byType.get(1)).toMatchObject({ locationName: 'Upwell structure', locationFlag: 'Corp Hangar 4' });
    expect(byType.get(2)).toMatchObject({ locationName: 'Upwell structure', locationFlag: '' });
    expect(byType.get(3)).toMatchObject({ locationName: 'In a ship', locationFlag: '' });
    expect(byType.get(4)).toMatchObject({ locationName: 'In a ship', locationFlag: '' });
    expect(byType.get(5)).toMatchObject({ locationName: 'In a container', locationFlag: '' });
    expect(byType.get(6)).toMatchObject({ locationName: 'In a container', locationFlag: '' });
  });

  it('shows a solar-system name verbatim (not station-formatted), degrading on a miss', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 30000142, locationType: 'solar_system' })])],
      [35, summary([holding({ locationId: 30009999, locationType: 'solar_system' })])],
    ]);
    const [resolved, missed] = buildOwnedAssetDetail(map, { '30000142': 'Jita' }, fmt, noContexts);
    expect(resolved!.heldBy[0]!.locationName).toBe('Jita');
    expect(missed!.heldBy[0]!.locationName).toBe('Unknown location');
  });

  it('degrades an unknown (other) location type', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 555, locationType: 'other' })])],
    ]);
    const [entry] = buildOwnedAssetDetail(map, {}, fmt, noContexts);
    expect(entry!.heldBy[0]!.locationName).toBe('Unknown location');
  });

  it('falls back to honest owner labels when names miss', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerType: 'character', ownerId: 7 }), corpHolding({ kind: 'unplaced', rootId: null })])],
    ]);
    const [entry] = buildOwnedAssetDetail(map, {}, fmt, contexts);
    expect(entry!.heldBy.map((h) => h.ownerName)).toEqual(['Character 7', 'Corporation 98000001']);
  });

  it('emits one entry per type with its full held-by list and summed owned qty', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 60003760, quantity: 100 }), holding({ locationId: 60008494, quantity: 250 })])],
    ]);
    const [entry] = buildOwnedAssetDetail(map, {}, fmt, noContexts);
    expect(entry!.ownedQty).toBe(350);
    expect(entry!.heldBy).toHaveLength(2);
    expect(entry!.heldBy.map((h) => h.quantity)).toEqual([100, 250]);
  });
});
