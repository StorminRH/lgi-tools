import { describe, expect, it } from 'vitest';
import { mapOwnedBlueprints } from './owned-blueprint-maps';
import type { OwnedBlueprintMeEntry } from './types';

describe('mapOwnedBlueprints', () => {
  const BLUEPRINT: OwnedBlueprintMeEntry = {
    blueprintTypeId: 681,
    me: 10,
    te: 20,
    ownerType: 'corporation',
    ownerName: 'Lo-Gang Industries',
    locationName: 'Assembly Array',
    locationFlag: 'CorpSAG1',
    containerName: null,
  };

  it('splits a response row into the compute ME and TE maps and the readout detail map', () => {
    expect(mapOwnedBlueprints([])).toEqual({ ownedMe: new Map(), ownedTe: new Map(), ownedDetail: new Map() });
    expect(mapOwnedBlueprints([BLUEPRINT])).toEqual({
      ownedMe: new Map([[681, 10]]),
      ownedTe: new Map([[681, 20]]),
      ownedDetail: new Map([
        [
          681,
          {
            te: 20,
            ownerType: 'corporation',
            ownerName: 'Lo-Gang Industries',
            locationName: 'Assembly Array',
            locationFlag: 'CorpSAG1',
            containerName: null,
          },
        ],
      ]),
    });
  });

  it('keys each blueprint TE by its blueprint type, matching the detail it reads out', () => {
    const { ownedTe, ownedDetail } = mapOwnedBlueprints([
      BLUEPRINT,
      { ...BLUEPRINT, blueprintTypeId: 682, me: 4, te: 8 },
    ]);
    expect([...ownedTe]).toEqual([
      [681, 20],
      [682, 8],
    ]);
    expect([...ownedTe]).toEqual([...ownedDetail].map(([bp, detail]) => [bp, detail.te]));
  });
});
