import { describe, expect, it } from 'vitest';
import {
  mergeNames,
  parseAssetNamesBody,
  parseCorporationBody,
  parseDivisionsBody,
  parseMemberTrackingBody,
  parseStructureBody,
  unnamedContainerIds,
  unnamedStructureIds,
} from './context-projection';
import { buildHoldingIndex, type CorpAssetItem } from './placement';

const STATION = 60003760;
const STRUCTURE = 1000000000001;
const SYSTEM = 30000142;
const OFFICE = 1001;
const STRUCTURE_OFFICE = 1002;
const CAN = 3001;
const INNER_CAN = 3002;
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

const index = buildHoldingIndex([
  item(OFFICE, STATION, 'station', 'OfficeFolder', 27),
  item(CAN, OFFICE, 'item', 'CorpSAG2', CAN_TYPE),
  item(INNER_CAN, CAN, 'item', 'Unlocked', CAN_TYPE),
  item(2001, INNER_CAN, 'item', 'Unlocked'),
  item(STRUCTURE, SYSTEM, 'solar_system', 'AutoFit', 35825),
  item(STRUCTURE_OFFICE, STRUCTURE, 'item', 'OfficeFolder', 27),
  item(2002, STRUCTURE_OFFICE, 'item', 'CorpSAG1'),
  item(2003, 1000000000002, 'station', 'CorpDeliveries'),
]);

describe('parseCorporationBody', () => {
  it('reads the home station and treats a corp without one as null', () => {
    expect(parseCorporationBody({ name: 'Corp', home_station_id: STATION })).toEqual({ hqStationId: STATION });
    expect(parseCorporationBody({ name: 'Corp' })).toEqual({ hqStationId: null });
    expect(parseCorporationBody('nope')).toBeNull();
  });

  it('reads a malformed home station as an unknown HQ instead of failing the corp', () => {
    expect(parseCorporationBody({ name: 'Corp', home_station_id: 0 })).toEqual({ hqStationId: null });
    expect(parseCorporationBody({ name: 'Corp', home_station_id: -5 })).toEqual({ hqStationId: null });
    expect(parseCorporationBody({ name: 'Corp', home_station_id: '60003760' })).toEqual({ hqStationId: null });
  });
});

describe('parseDivisionsBody', () => {
  it('keeps only renamed hangar divisions', () => {
    expect(
      parseDivisionsBody({
        hangar: [{ division: 1 }, { division: 2, name: 'Minerals' }, { division: 7, name: '' }],
        wallet: [{ division: 1, name: 'Master' }],
      }),
    ).toEqual({ 2: 'Minerals' });
    expect(parseDivisionsBody({})).toEqual({});
    expect(parseDivisionsBody({ hangar: [{ division: 8, name: 'x' }] })).toBeNull();
  });
});

describe('parseMemberTrackingBody', () => {
  it('keeps linked members only, with a null base for a member who set none', () => {
    const body = [
      { character_id: 90001, base_id: STATION, location_id: STATION },
      { character_id: 90002, location_id: SYSTEM },
      { character_id: 90003, base_id: STATION },
    ];
    expect(parseMemberTrackingBody(body, new Set([90001, 90002]))).toEqual([
      { characterId: 90001, baseId: STATION },
      { characterId: 90002, baseId: null },
    ]);
    expect(parseMemberTrackingBody({ character_id: 1 }, new Set())).toBeNull();
  });

  it('drops a malformed row, leaving that member unknown, and keeps the rest', () => {
    const body = [
      { character_id: 90001, base_id: 0 },
      { character_id: 90002, base_id: -1 },
      { character_id: 90003, base_id: '60003760' },
      { character_id: 90004, base_id: null },
      { character_id: 'x', base_id: STATION },
      'garbage',
      { character_id: 90005, base_id: STATION },
      { character_id: 90006 },
    ];
    expect(parseMemberTrackingBody(body, new Set([90001, 90002, 90003, 90004, 90005, 90006]))).toEqual([
      { characterId: 90005, baseId: STATION },
      { characterId: 90006, baseId: null },
    ]);
  });
});

describe('parseAssetNamesBody', () => {
  it('keys names by item id and drops empty names', () => {
    expect(
      parseAssetNamesBody([
        { item_id: CAN, name: 'Ore Can' },
        { item_id: INNER_CAN, name: '' },
      ]),
    ).toEqual({ [CAN]: 'Ore Can' });
    expect(parseAssetNamesBody([{ item_id: CAN }])).toBeNull();
  });
});

describe('parseStructureBody', () => {
  it('reads the structure name', () => {
    expect(parseStructureBody({ name: 'Jita Fort', solar_system_id: SYSTEM, owner_id: 1 })).toBe('Jita Fort');
    expect(parseStructureBody({ solar_system_id: SYSTEM })).toBeNull();
  });
});

describe('unnamedContainerIds', () => {
  it('lists every container the index knows that the profile has not named', () => {
    expect(unnamedContainerIds(index, new Map()).sort((a, b) => a - b)).toEqual([CAN, INNER_CAN]);
    expect(unnamedContainerIds(index, new Map([[CAN, 'Ore Can']]))).toEqual([INNER_CAN]);
  });
});

describe('unnamedStructureIds', () => {
  it('lists Upwell roots only, skipping NPC stations and named structures', () => {
    expect(unnamedStructureIds(index, new Map()).sort((a, b) => a - b)).toEqual([STRUCTURE, 1000000000002]);
    expect(unnamedStructureIds(index, new Map([[STRUCTURE, 'Jita Fort']]))).toEqual([1000000000002]);
  });

  it('draws the Upwell line at location id 1e12: the id just below is an NPC station', () => {
    const edge = buildHoldingIndex([
      item(2004, 999_999_999_999, 'station', 'CorpDeliveries'),
      item(2005, 1_000_000_000_000, 'station', 'CorpDeliveries'),
    ]);
    expect(unnamedStructureIds(edge, new Map())).toEqual([1_000_000_000_000]);
  });
});

describe('mergeNames', () => {
  it('keeps prior names and lets a fresh name win', () => {
    expect(mergeNames(new Map([[CAN, 'Old'], [INNER_CAN, 'Inner']]), { [CAN]: 'New' })).toEqual({
      [CAN]: 'New',
      [INNER_CAN]: 'Inner',
    });
  });
});
