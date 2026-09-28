import { describe, expect, it } from 'vitest';
import { buildCorpHoldingContext } from './context';
import { placeUnder } from './placement';

const STATION = 60003760;
const STRUCTURE = 1000000000001;

describe('buildCorpHoldingContext', () => {
  it('assembles the index and the names from the stored rows', () => {
    const context = buildCorpHoldingContext(
      98000001,
      [{ itemId: 1001, kind: 'office', rootId: STATION, division: null, deliveries: false, containers: [] }],
      {
        hqStationId: STATION,
        divisionNames: { 2: 'Minerals' },
        containerNames: { '3001': 'Ore Can' },
        structureNames: { [STRUCTURE]: 'Jita Fort' },
      },
    );
    expect(context.corporationId).toBe(98000001);
    expect(context.hq).toEqual({ kind: 'known', value: STATION });
    expect(context.divisionNames).toEqual({ 2: 'Minerals' });
    expect(context.containerNames.get(3001)).toBe('Ore Can');
    expect(context.structureNames.get(STRUCTURE)).toBe('Jita Fort');
    expect(placeUnder(context.index, 1001, 'CorpSAG3')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 3,
      containers: [],
    });
  });

  it('reads no profile row as an unknown HQ with default names', () => {
    const context = buildCorpHoldingContext(98000001, [], null);
    expect(context.hq).toEqual({ kind: 'unknown' });
    expect(context.divisionNames).toEqual({});
    expect(context.containerNames.size).toBe(0);
    expect(placeUnder(context.index, 1001, 'Unlocked')).toEqual({ kind: 'unplaced', rootId: 1001 });
  });

  it('reads a profile with no home station as an unknown HQ', () => {
    const context = buildCorpHoldingContext(98000001, [], {
      hqStationId: null,
      divisionNames: {},
      containerNames: {},
      structureNames: {},
    });
    expect(context.hq).toEqual({ kind: 'unknown' });
  });
});
