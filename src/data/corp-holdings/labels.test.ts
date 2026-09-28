import { describe, expect, it } from 'vitest';
import { labelPlacement } from './labels';
import type { CorpHoldingContext } from './placement';

const STRUCTURE = 1000000000001;
const STATION = 60003760;

const context: CorpHoldingContext = {
  corporationId: 98000001,
  index: { interiors: new Map() },
  hq: { kind: 'known', value: STATION },
  divisionNames: { 2: 'Minerals' },
  containerNames: new Map([[3001, 'Ore Can']]),
  structureNames: new Map([[STRUCTURE, 'Jita Fort']]),
};

describe('labelPlacement', () => {
  it('names a renamed division, its structure, and the innermost container', () => {
    expect(
      labelPlacement(
        {
          kind: 'hangar',
          rootId: STRUCTURE,
          division: 2,
          containers: [
            { itemId: 3000, typeId: 17366 },
            { itemId: 3001, typeId: 17366 },
          ],
        },
        context,
      ),
    ).toEqual({ rootName: 'Jita Fort', hangar: 'Minerals', containerName: 'Ore Can' });
  });

  it('falls back to the client default for a division the corp never renamed', () => {
    expect(labelPlacement({ kind: 'hangar', rootId: STATION, division: 3, containers: [] }, context)).toEqual({
      rootName: null,
      hangar: '3rd Division',
      containerName: null,
    });
  });

  it('leaves an unnamed container null so the caller can show its type name', () => {
    expect(
      labelPlacement(
        { kind: 'deliveries', rootId: STATION, containers: [{ itemId: 3002, typeId: 17366 }] },
        context,
      ),
    ).toEqual({ rootName: null, hangar: 'Deliveries', containerName: null });
  });

  it('labels an unplaced row with its root only', () => {
    expect(labelPlacement({ kind: 'unplaced', rootId: STRUCTURE }, context)).toEqual({
      rootName: 'Jita Fort',
      hangar: '',
      containerName: null,
    });
    expect(labelPlacement({ kind: 'unplaced', rootId: null }, context)).toEqual({
      rootName: null,
      hangar: '',
      containerName: null,
    });
  });
});
