import { describe, expect, it } from 'vitest';
import { buildCorpHoldingContext } from '@/data/corp-holdings/context';
import { buildHoldingIndex, type CorpAssetItem, toHoldingNodes } from '@/data/corp-holdings/placement';
import type { CorpRole } from '@/platform/auth/corp-roles';
import { compileCorpGrant, type CorpGrant } from '@/platform/auth/corp-visibility';
import {
  type AssetMapInput,
  type AssetRow,
  buildOwnedAssetMap,
  characterAssetInputs,
  visibleCorpAssetInputs,
} from './asset-map';

const CORP = 98000001;
const STATION = 60003760;
const OFFICE = 1001;
const CAN = 3001;
const CAN_TYPE = 17366;

const row = (
  typeId: number,
  quantity: number,
  owner: { ownerType: 'character'; ownerId: number } = { ownerType: 'character', ownerId: 1 },
  location: Pick<AssetRow, 'locationId' | 'locationFlag' | 'locationType'> = {
    locationId: STATION,
    locationFlag: 'Hangar',
    locationType: 'station',
  },
): AssetMapInput => ({ typeId, quantity, ...owner, ...location });

function item(
  itemId: number,
  locationId: number,
  locationType: CorpAssetItem['locationType'],
  locationFlag: string,
  typeId = 34,
): CorpAssetItem {
  return { itemId, typeId, locationId, locationType, locationFlag };
}

const index = buildHoldingIndex([
  item(OFFICE, STATION, 'station', 'OfficeFolder', 27),
  item(CAN, OFFICE, 'item', 'CorpSAG1', CAN_TYPE),
  item(2001, OFFICE, 'item', 'CorpSAG2'),
  item(2002, CAN, 'item', 'Unlocked'),
]);
const context = buildCorpHoldingContext(CORP, toHoldingNodes(index), null);

function grantWith(roles: CorpRole[], sharing: 'on' | 'off' = 'on'): CorpGrant {
  return compileCorpGrant({
    corporationId: CORP,
    sharing,
    context,
    members: [
      {
        characterId: 1,
        roles: {
          kind: 'known',
          roles: { global: new Set(roles), atHq: new Set(), atBase: new Set(), atOther: new Set() },
        },
        base: { kind: 'known', value: null },
      },
    ],
  });
}

const corpRows: AssetRow[] = [
  { typeId: 34, quantity: 100, locationId: OFFICE, locationFlag: 'CorpSAG1', locationType: 'item' },
  { typeId: 34, quantity: 250, locationId: OFFICE, locationFlag: 'CorpSAG2', locationType: 'item' },
  { typeId: 34, quantity: 7, locationId: CAN, locationFlag: 'Unlocked', locationType: 'item' },
  { typeId: 35, quantity: 1, locationId: STATION, locationFlag: 'StructureFuel', locationType: 'station' },
];

describe('visibleCorpAssetInputs', () => {
  it('keeps only the rows the grant can see, each with its resolved placement', () => {
    expect(visibleCorpAssetInputs(corpRows, grantWith(['Hangar_Query_1']))).toEqual([
      {
        ownerType: 'corporation',
        ownerId: CORP,
        placement: { kind: 'hangar', rootId: STATION, division: 1, containers: [] },
        typeId: 34,
        quantity: 100,
      },
      {
        ownerType: 'corporation',
        ownerId: CORP,
        placement: { kind: 'hangar', rootId: STATION, division: 1, containers: [{ itemId: CAN, typeId: CAN_TYPE }] },
        typeId: 34,
        quantity: 7,
      },
    ]);
  });

  it('gives a Director every row, unplaced ones included', () => {
    expect(visibleCorpAssetInputs(corpRows, grantWith(['Director'])).map((input) => input.quantity)).toEqual([
      100, 250, 7, 1,
    ]);
  });

  it('gives a member of a switched-off corp nothing', () => {
    expect(visibleCorpAssetInputs(corpRows, grantWith(['Accountant'], 'off'))).toEqual([]);
  });
});

describe('buildOwnedAssetMap', () => {
  it('sums only visible corp rows into ownedQty alongside character rows', () => {
    const map = buildOwnedAssetMap([
      ...characterAssetInputs([{ typeId: 34, quantity: 50, locationId: STATION, locationFlag: 'Hangar', locationType: 'station' }], 1),
      ...visibleCorpAssetInputs(corpRows, grantWith(['Hangar_Query_1'])),
    ]);
    const summary = map.get(34);
    expect(summary?.ownedQty).toBe(157);
    expect(summary?.heldBy.map((holding) => [holding.ownerType, holding.quantity])).toEqual([
      ['character', 50],
      ['corporation', 100],
      ['corporation', 7],
    ]);
    expect(map.has(35)).toBe(false);
  });

  it('sums owned quantity and keeps a held-by entry per holding', () => {
    const map = buildOwnedAssetMap([
      row(34, 100, undefined, { locationId: 60003760, locationFlag: 'Hangar', locationType: 'station' }),
      row(34, 250, undefined, { locationId: 60008494, locationFlag: 'Hangar', locationType: 'station' }),
    ]);
    const summary = map.get(34);
    expect(summary?.ownedQty).toBe(350);
    expect(summary?.heldBy).toHaveLength(2);
    expect(summary?.heldBy.map((holding) => holding.ownerType === 'character' && holding.locationId)).toEqual([
      60003760, 60008494,
    ]);
  });

  it('filters to the requested type ids when a filter is given', () => {
    const rows = [row(34, 100), row(35, 200), row(36, 300)];
    const map = buildOwnedAssetMap(rows, [34, 36]);
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([34, 36]);
    expect(map.has(35)).toBe(false);
  });

  it('keeps every type when no filter is given', () => {
    const map = buildOwnedAssetMap([row(34, 1), row(35, 2)]);
    expect(map.size).toBe(2);
  });

  it('carries a character holding verbatim without a typeId', () => {
    const map = buildOwnedAssetMap([
      row(34, 7, undefined, { locationId: 30000142, locationFlag: 'AssetSafety', locationType: 'solar_system' }),
    ]);
    expect(map.get(34)?.heldBy[0]).toEqual({
      ownerType: 'character',
      ownerId: 1,
      locationId: 30000142,
      locationFlag: 'AssetSafety',
      locationType: 'solar_system',
      quantity: 7,
    });
  });

  it('returns an empty map for no rows', () => {
    expect(buildOwnedAssetMap([]).size).toBe(0);
  });
});
