import { describe, expect, it } from 'vitest';
import { corpHoldingNameIds, labelCorpHolding } from './labels';
import type { CorpHoldingContext, Placement } from './placement';

const STRUCTURE = 1000000000001;
const UNNAMED_STRUCTURE = 1000000000002;
const STATION = 60003760;
const CAN_TYPE = 17366;

const context: CorpHoldingContext = {
  corporationId: 98000001,
  index: { interiors: new Map() },
  hq: { kind: 'known', value: STATION },
  divisionNames: { 2: 'Minerals' },
  containerNames: new Map([[3001, 'Ore Can']]),
  structureNames: new Map([[STRUCTURE, 'Jita Fort']]),
};

const names = { [STATION]: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', [CAN_TYPE]: 'Station Container' };
const fmt = (name: string) => `F:${name}`;

const nested: Placement = {
  kind: 'hangar',
  rootId: STRUCTURE,
  division: 2,
  containers: [
    { itemId: 3000, typeId: CAN_TYPE },
    { itemId: 3001, typeId: CAN_TYPE },
  ],
};

describe('labelCorpHolding', () => {
  it('names a renamed division, its structure from the corp context, and the innermost container', () => {
    expect(labelCorpHolding(nested, context, names, fmt)).toEqual({
      locationName: 'Jita Fort',
      locationFlag: 'Minerals',
      containerName: 'Ore Can',
    });
  });

  it('formats an NPC station from the public names and uses the client default division name', () => {
    expect(labelCorpHolding({ kind: 'hangar', rootId: STATION, division: 3, containers: [] }, context, names, fmt)).toEqual({
      locationName: 'F:Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      locationFlag: '3rd Division',
      containerName: null,
    });
  });

  it('falls back to the container type name when the corp has not named it', () => {
    const placement: Placement = { kind: 'deliveries', rootId: STATION, containers: [{ itemId: 3002, typeId: CAN_TYPE }] };
    expect(labelCorpHolding(placement, context, names, fmt)).toEqual({
      locationName: 'F:Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      locationFlag: 'Deliveries',
      containerName: 'Station Container',
    });
    expect(labelCorpHolding(placement, context, {}, fmt).containerName).toBeNull();
  });

  it('labels an unnamed structure generically and a missing or blank station honestly', () => {
    expect(labelCorpHolding({ kind: 'hangar', rootId: UNNAMED_STRUCTURE, division: 1, containers: [] }, context, {}, fmt)).toEqual({
      locationName: 'Upwell structure',
      locationFlag: '1st Division',
      containerName: null,
    });
    expect(labelCorpHolding({ kind: 'unplaced', rootId: STATION }, context, {}, fmt)).toEqual({
      locationName: 'Unknown location',
      locationFlag: '',
      containerName: null,
    });
    expect(labelCorpHolding({ kind: 'unplaced', rootId: STATION }, context, { [STATION]: '' }, fmt).locationName).toBe(
      'Unknown location',
    );
    expect(labelCorpHolding({ kind: 'unplaced', rootId: null }, context, names, fmt)).toEqual({
      locationName: 'Unknown location',
      locationFlag: '',
      containerName: null,
    });
  });
});

describe('corpHoldingNameIds', () => {
  it('asks for the NPC station and an unnamed container type, and nothing the context already names', () => {
    expect(corpHoldingNameIds(nested, context)).toEqual([]);
    expect(
      corpHoldingNameIds({ kind: 'deliveries', rootId: STATION, containers: [{ itemId: 3002, typeId: CAN_TYPE }] }, context),
    ).toEqual([STATION, CAN_TYPE]);
    expect(corpHoldingNameIds({ kind: 'hangar', rootId: UNNAMED_STRUCTURE, division: 1, containers: [] }, context)).toEqual([]);
    expect(corpHoldingNameIds({ kind: 'unplaced', rootId: null }, context)).toEqual([]);
  });
});
