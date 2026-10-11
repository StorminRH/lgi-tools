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

  it('splits a response row into the compute ME map and the readout detail map', () => {
    expect(mapOwnedBlueprints([])).toEqual({ ownedMe: new Map(), ownedDetail: new Map() });
    expect(mapOwnedBlueprints([BLUEPRINT])).toEqual({
      ownedMe: new Map([[681, 10]]),
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
});
