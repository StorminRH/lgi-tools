import { describe, expect, it } from 'vitest';
import {
  buildHoldingIndex,
  type CorpAssetItem,
  divisionOf,
  fromHoldingNodes,
  type HoldingNode,
  parseCorpAssetItems,
  placeUnder,
  toHoldingNodes,
} from './placement';

const STATION = 60003760;
const STRUCTURE = 1000000000001;
const SYSTEM = 30000142;
const OFFICE = 1001;
const STRUCTURE_OFFICE = 1002;
const CAN = 3001;
const INNER_CAN = 3003;
const DELIVERIES_CAN = 3002;
const SHIP = 4001;
const SHIP_CAN = 3004;
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

const payload: CorpAssetItem[] = [
  item(OFFICE, STATION, 'station', 'OfficeFolder', 27),
  item(2001, OFFICE, 'item', 'CorpSAG3'),
  item(CAN, OFFICE, 'item', 'CorpSAG2', CAN_TYPE),
  item(2002, CAN, 'item', 'Unlocked'),
  item(INNER_CAN, CAN, 'item', 'Unlocked', CAN_TYPE),
  item(2003, INNER_CAN, 'item', 'Locked'),
  item(2004, STATION, 'station', 'CorpDeliveries'),
  item(DELIVERIES_CAN, STATION, 'station', 'CorpDeliveries', CAN_TYPE),
  item(2005, DELIVERIES_CAN, 'item', 'Unlocked'),
  item(SHIP, OFFICE, 'item', 'CorpSAG1', 587),
  item(2006, SHIP, 'item', 'Cargo'),
  item(SHIP_CAN, SHIP, 'item', 'Cargo', CAN_TYPE),
  item(2007, SHIP_CAN, 'item', 'Unlocked'),
  item(5001, 5002, 'item', 'Unlocked', CAN_TYPE),
  item(5002, 5001, 'item', 'Unlocked', CAN_TYPE),
  item(2008, 5001, 'item', 'Unlocked'),
  item(STRUCTURE, SYSTEM, 'solar_system', 'AutoFit', 35825),
  item(STRUCTURE_OFFICE, STRUCTURE, 'item', 'OfficeFolder', 27),
  item(2009, STRUCTURE_OFFICE, 'item', 'CorpSAG5'),
  item(2010, STRUCTURE, 'item', 'StructureFuel'),
];

const index = buildHoldingIndex(payload);

describe('placeUnder', () => {
  it('places an office child by its CorpSAG flag', () => {
    expect(placeUnder(index, OFFICE, 'CorpSAG3')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 3,
      containers: [],
    });
  });

  it('places container contents in the division the container sits in', () => {
    expect(placeUnder(index, CAN, 'Unlocked')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 2,
      containers: [{ itemId: CAN, typeId: CAN_TYPE }],
    });
  });

  it('lists nested containers outermost-first', () => {
    expect(placeUnder(index, INNER_CAN, 'Locked')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 2,
      containers: [
        { itemId: CAN, typeId: CAN_TYPE },
        { itemId: INNER_CAN, typeId: CAN_TYPE },
      ],
    });
  });

  it('places CorpDeliveries at the station root', () => {
    expect(placeUnder(index, STATION, 'CorpDeliveries')).toEqual({
      kind: 'deliveries',
      rootId: STATION,
      containers: [],
    });
  });

  it('inherits deliveries for a container in deliveries', () => {
    expect(placeUnder(index, DELIVERIES_CAN, 'Unlocked')).toEqual({
      kind: 'deliveries',
      rootId: STATION,
      containers: [{ itemId: DELIVERIES_CAN, typeId: CAN_TYPE }],
    });
  });

  it('leaves ship cargo in a division unplaced', () => {
    expect(placeUnder(index, SHIP, 'Cargo')).toEqual({ kind: 'unplaced', rootId: STATION });
  });

  it('leaves the contents of a container inside a ship unplaced', () => {
    expect(placeUnder(index, SHIP_CAN, 'Unlocked')).toEqual({ kind: 'unplaced', rootId: STATION });
  });

  it('resolves a two-item cycle to unplaced with no root', () => {
    expect(placeUnder(index, 5001, 'Unlocked')).toEqual({ kind: 'unplaced', rootId: null });
    expect(placeUnder(index, 5002, 'Unlocked')).toEqual({ kind: 'unplaced', rootId: null });
  });

  it('leaves a row under a parent the index has never seen unplaced with no root', () => {
    expect(placeUnder(index, 7777, 'Unlocked')).toEqual({ kind: 'unplaced', rootId: null });
  });

  it('does not let a CorpSAG flag under an unindexed office pick a tier', () => {
    expect(placeUnder(index, 7777, 'CorpSAG3')).toEqual({ kind: 'unplaced', rootId: null });
  });

  it('roots an office inside a corp-owned structure at the structure item', () => {
    expect(placeUnder(index, STRUCTURE_OFFICE, 'CorpSAG5')).toEqual({
      kind: 'hangar',
      rootId: STRUCTURE,
      division: 5,
      containers: [],
    });
  });

  it('leaves structure fittings unplaced under the structure', () => {
    expect(placeUnder(index, STRUCTURE, 'StructureFuel')).toEqual({ kind: 'unplaced', rootId: STRUCTURE });
  });

  it('places a CorpSAG flag directly under a root as that division', () => {
    expect(placeUnder(index, STATION, 'CorpSAG4')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 4,
      containers: [],
    });
  });

  it('leaves a non-division flag in an office unplaced', () => {
    expect(placeUnder(index, OFFICE, 'Hangar')).toEqual({ kind: 'unplaced', rootId: STATION });
  });

  it('stops following containers past sixteen levels', () => {
    const chain = [item(9001, STATION, 'station', 'CorpSAG1', CAN_TYPE)];
    for (let depth = 2; depth <= 17; depth += 1) {
      chain.push(item(9000 + depth, 9000 + depth - 1, 'item', 'Unlocked', CAN_TYPE));
    }
    const deep = buildHoldingIndex([...chain, item(9100, 9017, 'item', 'Unlocked')]);
    expect(placeUnder(deep, 9016, 'Unlocked')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 1,
      containers: chain.slice(0, 16).map((can) => ({ itemId: can.itemId, typeId: CAN_TYPE })),
    });
    expect(placeUnder(deep, 9017, 'Unlocked')).toEqual({ kind: 'unplaced', rootId: STATION });
  });
});

describe('buildHoldingIndex', () => {
  it('indexes only items that are some item\'s parent', () => {
    expect([...index.interiors.keys()].sort((a, b) => a - b)).toEqual([
      OFFICE,
      STRUCTURE_OFFICE,
      DELIVERIES_CAN,
      CAN,
      INNER_CAN,
      SHIP_CAN,
      SHIP,
      5001,
      5002,
      SYSTEM,
      STATION,
      STRUCTURE,
    ].sort((a, b) => a - b));
  });

  it('resolves the same tree regardless of payload order', () => {
    const reversed = buildHoldingIndex([...payload].reverse());
    expect(placeUnder(reversed, INNER_CAN, 'Locked')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 2,
      containers: [
        { itemId: CAN, typeId: CAN_TYPE },
        { itemId: INNER_CAN, typeId: CAN_TYPE },
      ],
    });
    expect(placeUnder(reversed, 5001, 'Unlocked')).toEqual({ kind: 'unplaced', rootId: null });
  });
});

describe('divisionOf', () => {
  it('maps CorpSAG1..7 and nothing else', () => {
    expect(divisionOf('CorpSAG1')).toBe(1);
    expect(divisionOf('CorpSAG7')).toBe(7);
    expect(divisionOf('CorpSAG8')).toBeNull();
    expect(divisionOf('Hangar')).toBeNull();
  });
});

describe('parseCorpAssetItems', () => {
  it('parses the ESI item fields the walk needs', () => {
    expect(
      parseCorpAssetItems([
        {
          item_id: 1001,
          type_id: 27,
          quantity: 1,
          location_id: STATION,
          location_type: 'station',
          location_flag: 'OfficeFolder',
          is_singleton: true,
        },
      ]),
    ).toEqual([item(OFFICE, STATION, 'station', 'OfficeFolder', 27)]);
  });

  it('rejects a payload with a malformed item', () => {
    expect(parseCorpAssetItems([{ type_id: 27, location_id: STATION }])).toBeNull();
    expect(
      parseCorpAssetItems([
        { item_id: 1, type_id: 27, location_id: STATION, location_type: 'planet', location_flag: 'Hangar' },
      ]),
    ).toBeNull();
  });
});

describe('holding node rows', () => {
  const small = buildHoldingIndex([
    item(OFFICE, STATION, 'station', 'OfficeFolder', 27),
    item(CAN, OFFICE, 'item', 'CorpSAG2', CAN_TYPE),
    item(2002, CAN, 'item', 'Unlocked'),
    item(DELIVERIES_CAN, STATION, 'station', 'CorpDeliveries', CAN_TYPE),
    item(2005, DELIVERIES_CAN, 'item', 'Unlocked'),
    item(SHIP, OFFICE, 'item', 'CorpSAG1', 587),
    item(2006, SHIP, 'item', 'Cargo'),
  ]);

  it('flattens each interior to one row', () => {
    const rows = toHoldingNodes(small).sort((a, b) => a.itemId - b.itemId);
    expect(rows).toEqual([
      { itemId: OFFICE, kind: 'office', rootId: STATION, division: null, deliveries: false, containers: [] },
      {
        itemId: CAN,
        kind: 'within',
        rootId: STATION,
        division: 2,
        deliveries: false,
        containers: [{ itemId: CAN, typeId: CAN_TYPE }],
      },
      {
        itemId: DELIVERIES_CAN,
        kind: 'within',
        rootId: STATION,
        division: null,
        deliveries: true,
        containers: [{ itemId: DELIVERIES_CAN, typeId: CAN_TYPE }],
      },
      {
        itemId: SHIP,
        kind: 'within',
        rootId: STATION,
        division: 1,
        deliveries: false,
        containers: [{ itemId: SHIP, typeId: 587 }],
      },
      { itemId: STATION, kind: 'root', rootId: STATION, division: null, deliveries: false, containers: [] },
    ]);
  });

  it('rebuilds placements from the rows', () => {
    const rebuilt = fromHoldingNodes(toHoldingNodes(small));
    expect(placeUnder(rebuilt, CAN, 'Unlocked')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 2,
      containers: [{ itemId: CAN, typeId: CAN_TYPE }],
    });
    expect(placeUnder(rebuilt, DELIVERIES_CAN, 'Unlocked')).toEqual({
      kind: 'deliveries',
      rootId: STATION,
      containers: [{ itemId: DELIVERIES_CAN, typeId: CAN_TYPE }],
    });
    expect(placeUnder(rebuilt, SHIP, 'Cargo')).toEqual({ kind: 'unplaced', rootId: STATION });
    expect(placeUnder(rebuilt, OFFICE, 'CorpSAG3')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 3,
      containers: [],
    });
  });

  it('reads rows the walker could not have written as opaque', () => {
    const corrupt: HoldingNode[] = [
      { itemId: 11, kind: 'within', rootId: STATION, division: null, deliveries: false, containers: [] },
      { itemId: 12, kind: 'office', rootId: null, division: null, deliveries: false, containers: [] },
    ];
    const rebuilt = fromHoldingNodes(corrupt);
    expect(placeUnder(rebuilt, 11, 'Unlocked')).toEqual({ kind: 'unplaced', rootId: STATION });
    expect(placeUnder(rebuilt, 12, 'CorpSAG1')).toEqual({ kind: 'unplaced', rootId: null });
  });
});
