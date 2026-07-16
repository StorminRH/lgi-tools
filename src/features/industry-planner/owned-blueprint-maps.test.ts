import { describe, expect, it } from 'vitest';
import { mapOwnedBlueprints } from './owned-blueprint-maps';
import type { OwnedBlueprintMeEntry } from './types';

const BLUEPRINT: OwnedBlueprintMeEntry = {
  blueprintTypeId: 681,
  me: 10,
  te: 20,
  ownerType: 'corporation',
  ownerName: 'Lo-Gang Industries',
  locationName: 'Assembly Array',
  locationFlag: 'CorpSAG1',
};

describe('mapOwnedBlueprints', () => {
  it('derives the compute and readout maps from the same response row', () => {
    const result = mapOwnedBlueprints([BLUEPRINT]);

    expect(result.ownedMe).toEqual(new Map([[681, 10]]));
    expect(result.ownedDetail).toEqual(
      new Map([
        [
          681,
          {
            te: 20,
            ownerType: 'corporation',
            ownerName: 'Lo-Gang Industries',
            locationName: 'Assembly Array',
            locationFlag: 'CorpSAG1',
          },
        ],
      ]),
    );
  });

  it('settles an empty response into two empty maps', () => {
    expect(mapOwnedBlueprints([])).toEqual({
      ownedMe: new Map(),
      ownedDetail: new Map(),
    });
  });
});
