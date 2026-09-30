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
  it('collects owners and only the names the detail view still has to resolve', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerId: 5, locationId: 60003760, locationType: 'station' })])],
      [35, summary([holding({ ownerId: 5, locationId: 30000142, locationType: 'solar_system' })])],
      [36, summary([holding({ ownerId: 9, locationId: STRUCTURE, locationType: 'station' })])],
      [37, summary([holding({ ownerId: 9, locationId: 1_400_000_000_001, locationType: 'item' })])],
      [38, summary([holding({ ownerId: 9, locationId: 12_345, locationType: 'other' })])],
      [39, summary([corpHolding({ kind: 'hangar', rootId: STATION, division: 1, containers: [{ itemId: 3999, typeId: CAN_TYPE }] })])],
      [40, summary([corpHolding({ kind: 'hangar', rootId: STRUCTURE, division: 2, containers: [{ itemId: CAN, typeId: CAN_TYPE }] })])],
    ]);
    expect([...collectAssetNameIds(map, contexts)].sort((a, b) => a - b)).toEqual([5, 9, CAN_TYPE, 30000142, STATION, CORP]);
    expect(collectAssetNameIds(new Map(), noContexts)).toEqual([]);
  });
});

describe('buildOwnedAssetDetail', () => {
  it('labels each holding the client can show and sums quantity per type', () => {
    const stationName = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
    const characterStation: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerId: 5, locationId: STATION, locationFlag: 'Hangar', quantity: 250 })])],
    ]);
    expect(buildOwnedAssetDetail(characterStation, { '5': 'Alice', [STATION]: stationName }, fmt, noContexts)).toEqual([
      {
        typeId: 34,
        ownedQty: 250,
        heldBy: [
          {
            ownerType: 'character',
            ownerName: 'Alice',
            locationName: `F:${stationName}`,
            locationFlag: '',
            containerName: null,
            quantity: 250,
          },
        ],
      },
    ]);

    const corp: OwnedAssetMap = new Map([
      [34, summary([corpHolding({ kind: 'hangar', rootId: STRUCTURE, division: 2, containers: [{ itemId: CAN, typeId: CAN_TYPE }] }, 40)])],
    ]);
    expect(buildOwnedAssetDetail(corp, { [CORP]: 'Test Corp' }, fmt, contexts)[0]!.heldBy).toEqual([
      {
        ownerType: 'corporation',
        ownerName: 'Test Corp',
        locationName: 'Jita Fort',
        locationFlag: 'Minerals',
        containerName: 'Ore Can',
        quantity: 40,
      },
    ]);

    const structureFloor: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: STRUCTURE, locationFlag: 'Hangar', locationType: 'station' })])],
    ]);
    expect(buildOwnedAssetDetail(structureFloor, {}, fmt, noContexts)[0]!.heldBy[0]).toMatchObject({
      locationName: 'Upwell structure',
      locationFlag: '',
    });

    const nested = (flag: string) =>
      summary([holding({ locationId: 1_053_000_000_001, locationFlag: flag, locationType: 'item' })]);
    const nestedMap: OwnedAssetMap = new Map([
      [1, nested('CorpSAG4')],
      [2, nested('Hangar')],
      [3, nested('Cargo')],
      [4, nested('HiSlot0')],
      [5, nested('Unlocked')],
      [6, nested('SomethingNew')],
    ]);
    const byType = new Map(buildOwnedAssetDetail(nestedMap, {}, fmt, noContexts).map((entry) => [entry.typeId, entry.heldBy[0]]));
    expect(byType.get(1)).toMatchObject({ locationName: 'Upwell structure' });
    expect(byType.get(2)).toMatchObject({ locationName: 'Upwell structure' });
    expect(byType.get(3)).toMatchObject({ locationName: 'In a ship' });
    expect(byType.get(4)).toMatchObject({ locationName: 'In a ship' });
    expect(byType.get(5)).toMatchObject({ locationName: 'In a container' });
    expect(byType.get(6)).toMatchObject({ locationName: 'In a container' });

    const systems: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 30000142, locationType: 'solar_system' })])],
      [35, summary([holding({ locationId: 30009999, locationType: 'solar_system' })])],
      [36, summary([holding({ locationId: 555, locationType: 'other' })])],
    ]);
    const [resolved, missed, other] = buildOwnedAssetDetail(systems, { '30000142': 'Jita' }, fmt, noContexts);
    expect(resolved!.heldBy[0]!.locationName).toBe('Jita');
    expect(missed!.heldBy[0]!.locationName).toBe('Unknown location');
    expect(other!.heldBy[0]!.locationName).toBe('Unknown location');

    const missing: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerId: 7 }), corpHolding({ kind: 'unplaced', rootId: null })])],
    ]);
    const [entry] = buildOwnedAssetDetail(missing, {}, fmt, contexts);
    expect(entry!.heldBy.map((held) => held.ownerName)).toEqual(['Character 7', `Corporation ${CORP}`]);

    const summed: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: STATION, quantity: 100 }), holding({ locationId: 60008494, quantity: 250 })])],
    ]);
    const [quantities] = buildOwnedAssetDetail(summed, {}, fmt, noContexts);
    expect(quantities!.ownedQty).toBe(350);
    expect(quantities!.heldBy.map((held) => held.quantity)).toEqual([100, 250]);
  });
});
