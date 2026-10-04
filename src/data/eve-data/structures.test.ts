import { describe, expect, it } from 'vitest';
import {
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
  STRUCTURE_RIG_SIZE_ATTR,
} from './constants';
import { attainableFilterSets, matchingFilterIds, moduleFitsHull, rigFitsStructure, shapeStructureRigs, type TargetFilter } from './structures';
import type { AttrMap } from './types';

describe('matchingFilterIds', () => {
  // A slice of CCP's industry target filters, as the SDE ships them.
  const FILTERS: TargetFilter[] = [
    { id: 2, name: 'Equipment', categoryIds: [7, 20, 22], groupIds: [12, 340, 448, 649] },
    { id: 3, name: 'Ships', categoryIds: [6, 32], groupIds: [] },
    { id: 6, name: 'Small T2 Ships', categoryIds: [], groupIds: [324, 541, 830] },
    { id: 14, name: 'Components', categoryIds: [], groupIds: [332, 334, 716, 964] },
    { id: 18, name: 'Composite Reactions', categoryIds: [], groupIds: [428, 429, 4932] },
  ];

  it("matches a product by its group's category", () => {
    expect(matchingFilterIds(FILTERS, { groupId: 55, categoryId: 7 })).toEqual([2]);
  });

  it('matches a product by its own group', () => {
    expect(matchingFilterIds(FILTERS, { groupId: 334, categoryId: 17 })).toEqual([14]);
    expect(matchingFilterIds(FILTERS, { groupId: 429, categoryId: 4 })).toEqual([18]);
  });

  it('returns every filter a product falls in, by group and by category alike', () => {
    expect(matchingFilterIds(FILTERS, { groupId: 324, categoryId: 6 })).toEqual([3, 6]);
  });

  it('returns nothing for a product no filter targets', () => {
    expect(matchingFilterIds(FILTERS, { groupId: 18, categoryId: 4 })).toEqual([]);
    expect(matchingFilterIds([], { groupId: 334, categoryId: 17 })).toEqual([]);
  });
});

describe('attainableFilterSets', () => {
  it('has no target combinations without any SDE groups', () => {
    expect(attainableFilterSets([], [])).toEqual([]);
  });

  it('dedupes actual group matches and retains Odysseus overlapping ship targets', () => {
    const filters: TargetFilter[] = [
      { id: 8, name: 'Medium T2 Ships', categoryIds: [32], groupIds: [358, 4902] },
      { id: 3, name: 'Ships', categoryIds: [6, 32], groupIds: [] },
      { id: 7, name: 'Medium T1 Ships', categoryIds: [], groupIds: [26, 4902] },
    ];
    expect(attainableFilterSets(filters, [
      { groupId: 26, categoryId: 6 },
      { groupId: 358, categoryId: 6 },
      { groupId: 4902, categoryId: 6 },
      { groupId: 954, categoryId: 32 },
      { groupId: 18, categoryId: 4 },
    ])).toEqual([[3, 7], [3, 8], [3, 7, 8], []]);
  });
});

describe('rigFitsStructure', () => {
  const EC = SDE_ENGINEERING_COMPLEX_GROUP_ID;
  const REFINERY = SDE_REFINERY_GROUP_ID;
  const CITADEL = SDE_CITADEL_GROUP_ID;

  const lMfgRig = { canFitGroups: [CITADEL, EC, REFINERY], rigSize: 3 };
  const xlMfgRig = { canFitGroups: [CITADEL, EC, REFINERY], rigSize: 4 };
  const mReactionRig = { canFitGroups: [REFINERY], rigSize: 2 };
  const lReactionRig = { canFitGroups: [REFINERY], rigSize: 3 };

  const azbel = { groupId: EC, rigSize: 3 } as const;
  const sotiyo = { groupId: EC, rigSize: 4 } as const;
  const raitaru = { groupId: EC, rigSize: 2 } as const;
  const athanor = { groupId: REFINERY, rigSize: 2 } as const;
  const tatara = { groupId: REFINERY, rigSize: 3 } as const;
  const fortizar = { groupId: CITADEL, rigSize: 3 } as const;
  const keepstar = { groupId: CITADEL, rigSize: 4 } as const;

  it('fits a manufacturing rig to an Engineering Complex of the same size', () => {
    expect(rigFitsStructure(lMfgRig, azbel)).toBe(true);
    expect(rigFitsStructure(xlMfgRig, sotiyo)).toBe(true);
  });

  it('fits a manufacturing rig to a Refinery (mfg rigs fit all three groups)', () => {
    expect(rigFitsStructure(lMfgRig, tatara)).toBe(true);
  });

  it('fits a manufacturing rig to a Citadel (no role, but the rig still fits)', () => {
    expect(rigFitsStructure(lMfgRig, fortizar)).toBe(true);
    expect(rigFitsStructure(xlMfgRig, keepstar)).toBe(true);
  });

  it('fits a reaction rig to a Refinery of the same size', () => {
    expect(rigFitsStructure(mReactionRig, athanor)).toBe(true);
    expect(rigFitsStructure(lReactionRig, tatara)).toBe(true);
  });

  it('rejects a reaction rig on an Engineering Complex (group not in canFitGroups)', () => {
    expect(rigFitsStructure(mReactionRig, raitaru)).toBe(false);
    expect(rigFitsStructure(lReactionRig, azbel)).toBe(false);
  });

  it('rejects a reaction rig on a Citadel (canFitGroups is Refinery only)', () => {
    expect(rigFitsStructure(lReactionRig, fortizar)).toBe(false);
  });

  it('rejects a size mismatch even when the group fits (XL rig on an L structure)', () => {
    expect(rigFitsStructure(xlMfgRig, azbel)).toBe(false);
  });
});

describe('shapeStructureRigs', () => {
  it('shapes every row it is given, reading canFitGroups + rigSize, name-sorted', () => {
    const rows = [
      {
        id: 43920,
        name: 'Standup L-Set Basic Small Ship Manufacturing Material Efficiency I',
        attributes: { [STRUCTURE_RIG_SIZE_ATTR]: 3, 1298: 1404, 1299: 1406, 1300: 1657 } as AttrMap,
      },
      {
        id: 46640,
        name: 'Standup M-Set Reactor Efficiency I',
        attributes: { [STRUCTURE_RIG_SIZE_ATTR]: 2, 1298: 1406 } as AttrMap,
      },
    ];
    expect(shapeStructureRigs(rows)).toEqual([
      {
        typeId: 43920,
        name: 'Standup L-Set Basic Small Ship Manufacturing Material Efficiency I',
        canFitGroups: [1404, 1406, 1657],
        rigSize: 3,
      },
      {
        typeId: 46640,
        name: 'Standup M-Set Reactor Efficiency I',
        canFitGroups: [1406],
        rigSize: 2,
      },
    ]);
  });

  it('drops undefined canFitGroup attrs and defaults a missing rig size to null', () => {
    const [rig] = shapeStructureRigs([{ id: 1, name: 'Rig', attributes: { 1298: 1406 } as AttrMap }]);
    expect(rig).toEqual({ typeId: 1, name: 'Rig', canFitGroups: [1406], rigSize: null });
  });

  it('reads a row with no dogma as fitting nothing', () => {
    expect(shapeStructureRigs([{ id: 1, name: 'x', attributes: null }])).toEqual([
      { typeId: 1, name: 'x', canFitGroups: [], rigSize: null },
    ]);
  });
});

describe('moduleFitsHull', () => {
  const FIT = { types: [1302, 1303], groups: [1298] };

  it('fits a hull its type attributes name, or whose group its group attributes name', () => {
    const shipyard: AttrMap = { 50: 600, 1302: 35827, 1303: 35826 };
    expect(moduleFitsHull(shipyard, FIT, { typeId: 35827, groupId: SDE_ENGINEERING_COMPLEX_GROUP_ID })).toBe(true);
    expect(moduleFitsHull(shipyard, FIT, { typeId: 35825, groupId: SDE_ENGINEERING_COMPLEX_GROUP_ID })).toBe(false);
    const byGroup: AttrMap = { 1298: SDE_REFINERY_GROUP_ID };
    expect(moduleFitsHull(byGroup, FIT, { typeId: 35836, groupId: SDE_REFINERY_GROUP_ID })).toBe(true);
    expect(moduleFitsHull(byGroup, FIT, { typeId: 35832, groupId: SDE_CITADEL_GROUP_ID })).toBe(false);
  });

  it('fits nothing when the module carries no fitting attributes', () => {
    expect(moduleFitsHull({}, FIT, { typeId: 35827, groupId: SDE_ENGINEERING_COMPLEX_GROUP_ID })).toBe(false);
  });
});
