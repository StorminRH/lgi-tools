import { describe, expect, it } from 'vitest';
import { type BlueprintMapInput, toOwnedBlueprintMap } from './blueprint-map';

const row = (
  typeId: number,
  me: number,
  te: number,
  runs: number,
  owner: Pick<BlueprintMapInput, 'ownerType' | 'ownerId'> = { ownerType: 'character', ownerId: 1 },
  location: Pick<BlueprintMapInput, 'locationId' | 'locationFlag'> = {
    locationId: 60003760,
    locationFlag: 'Hangar',
  },
): BlueprintMapInput => ({
  typeId,
  materialEfficiency: me,
  timeEfficiency: te,
  runs,
  ...owner,
  ...location,
});

describe('toOwnedBlueprintMap', () => {
  it('keeps the best (highest-ME) copy per type and counts how many are owned', () => {
    const map = toOwnedBlueprintMap([row(34, 5, 10, -1), row(34, 10, 20, 30), row(99, 0, 0, -1)]);
    expect(map.get(34)).toEqual({
      me: 10,
      te: 20,
      runs: 30,
      owned: 2,
      ownerType: 'character',
      ownerId: 1,
      locationId: 60003760,
      locationFlag: 'Hangar',
    });
    expect(map.get(99)).toEqual({
      me: 0,
      te: 0,
      runs: -1,
      owned: 1,
      ownerType: 'character',
      ownerId: 1,
      locationId: 60003760,
      locationFlag: 'Hangar',
    });
  });

  it('breaks an ME tie by TE, then by runs', () => {
    const map = toOwnedBlueprintMap([row(1, 10, 5, 1), row(1, 10, 8, 1), row(1, 10, 8, 5)]);
    expect(map.get(1)).toMatchObject({ me: 10, te: 8, runs: 5, owned: 3 });
  });

  it('records the winning copy owner + location, not the first-seen copy', () => {
    // A worse copy is seen first (character, station); the winning high-ME copy is
    // owned by a corporation at a structure — its provenance is what surfaces.
    const map = toOwnedBlueprintMap([
      row(34, 5, 0, -1, { ownerType: 'character', ownerId: 100 }, { locationId: 60003760, locationFlag: 'Hangar' }),
      row(34, 10, 0, 30, { ownerType: 'corporation', ownerId: 200 }, { locationId: 1_036_000_000_001, locationFlag: 'CorpSAG1' }),
    ]);
    expect(map.get(34)).toMatchObject({
      me: 10,
      ownerType: 'corporation',
      ownerId: 200,
      locationId: 1_036_000_000_001,
      locationFlag: 'CorpSAG1',
    });
  });

  it('does not let a later non-winning copy steal the recorded owner + location', () => {
    // The winner is seen first; a worse copy with different provenance follows.
    const map = toOwnedBlueprintMap([
      row(34, 10, 0, 30, { ownerType: 'character', ownerId: 1 }, { locationId: 60003760, locationFlag: 'Hangar' }),
      row(34, 5, 0, -1, { ownerType: 'corporation', ownerId: 999 }, { locationId: 1_036_000_000_002, locationFlag: 'CorpSAG2' }),
    ]);
    expect(map.get(34)).toMatchObject({
      me: 10,
      owned: 2,
      ownerType: 'character',
      ownerId: 1,
      locationId: 60003760,
      locationFlag: 'Hangar',
    });
  });

  it('is empty for no rows', () => {
    expect(toOwnedBlueprintMap([]).size).toBe(0);
  });
});
