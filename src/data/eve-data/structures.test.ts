import { describe, expect, it } from 'vitest';
import {
  RIG_MFG_MATERIAL_ATTR,
  RIG_REACTION_TIME_ATTR,
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
  STRUCTURE_RIG_SIZE_ATTR,
} from './constants';
import { isIndustryRig, rigFitsStructure, shapeStructureRigs } from './structures';
import type { AttrMap } from './types';

const equipmentMfgEff: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3,
  [RIG_MFG_MATERIAL_ATTR]: -2,
  2593: -20,
};
const reactorEff: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3,
  [RIG_REACTION_TIME_ATTR]: -20,
  2714: -2,
};
const copyOptimization: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3,
  [RIG_MFG_MATERIAL_ATTR]: 0,
  2593: -20,
  2595: -10,
};

describe('isIndustryRig', () => {
  it('accepts a manufacturing-efficiency rig (nonzero material reduction)', () => {
    expect(isIndustryRig(equipmentMfgEff)).toBe(true);
  });

  it('accepts a reactor-efficiency rig (reactor-time attr present)', () => {
    expect(isIndustryRig(reactorEff)).toBe(true);
  });

  it('rejects optimization rigs that carry time/cost but no material reduction', () => {
    expect(isIndustryRig(copyOptimization)).toBe(false);
  });

  it('rejects a non-industry rig (no relevant attrs)', () => {
    expect(isIndustryRig({ [STRUCTURE_RIG_SIZE_ATTR]: 2, 999: 5 })).toBe(false);
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
  it('keeps only industry rigs, reading canFitGroups + rigSize, name-sorted', () => {
    const rows = [
      {
        id: 43920,
        name: 'Standup L-Set Basic Small Ship Manufacturing Material Efficiency I',
        attributes: {
          [STRUCTURE_RIG_SIZE_ATTR]: 3,
          [RIG_MFG_MATERIAL_ATTR]: -2,
          1298: 1404,
          1299: 1406,
          1300: 1657,
        } as AttrMap,
      },
      {
        id: 99999,
        name: 'Standup L-Set Copy Optimization',
        attributes: { [STRUCTURE_RIG_SIZE_ATTR]: 3, [RIG_MFG_MATERIAL_ATTR]: 0 } as AttrMap,
      },
      {
        id: 46640,
        name: 'Standup M-Set Reactor Efficiency I',
        attributes: {
          [STRUCTURE_RIG_SIZE_ATTR]: 2,
          [RIG_REACTION_TIME_ATTR]: -20,
          1298: 1406,
        } as AttrMap,
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
    const [rig] = shapeStructureRigs([
      {
        id: 1,
        name: 'Rig',
        attributes: { [RIG_MFG_MATERIAL_ATTR]: -1, 1298: 1406 } as AttrMap,
      },
    ]);
    expect(rig).toEqual({ typeId: 1, name: 'Rig', canFitGroups: [1406], rigSize: null });
  });

  it('returns an empty array when no row is an industry rig', () => {
    expect(shapeStructureRigs([{ id: 1, name: 'x', attributes: {} }])).toEqual([]);
  });
});
