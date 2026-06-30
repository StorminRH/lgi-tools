import { describe, expect, it } from 'vitest';
import {
  RIG_MFG_MATERIAL_ATTR,
  RIG_REACTION_TIME_ATTR,
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
  STRUCTURE_RIG_SIZE_ATTR,
} from './constants';
import { isIndustryRig, rigFitsStructure } from './structures';
import type { AttrMap } from './types';

// Real SDE dogma shapes (verified against the local SDE this session).
const equipmentMfgEff: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3, // L
  [RIG_MFG_MATERIAL_ATTR]: -2, // material reduction → a manufacturing rig
  2593: -20, // time
};
const reactorEff: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3,
  [RIG_REACTION_TIME_ATTR]: -20, // reactor time → a reaction rig
  2714: -2, // reaction material (deliberately unread by the bonus math)
};
const copyOptimization: AttrMap = {
  [STRUCTURE_RIG_SIZE_ATTR]: 3,
  [RIG_MFG_MATERIAL_ATTR]: 0, // shares the time/cost attrs but NO material reduction
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
    // Blueprint Copy / Invention / Research optimization rigs share 2593/2595 but
    // must NOT be offerable — the bonus math reads 2593 for every fitted rig, so
    // including one would wrongly speed up a manufacturing build.
    expect(isIndustryRig(copyOptimization)).toBe(false);
  });

  it('rejects a non-industry rig (no relevant attrs)', () => {
    expect(isIndustryRig({ [STRUCTURE_RIG_SIZE_ATTR]: 2, 999: 5 })).toBe(false);
  });
});

describe('rigFitsStructure', () => {
  const EC = SDE_ENGINEERING_COMPLEX_GROUP_ID; // 1404
  const REFINERY = SDE_REFINERY_GROUP_ID; // 1406
  const CITADEL = SDE_CITADEL_GROUP_ID; // 1657

  // Manufacturing rigs carry canFitShipGroup {EC, Refinery, Citadel}; reaction
  // rigs carry {Refinery} only (verified against the local SDE).
  const lMfgRig = { canFitGroups: [CITADEL, EC, REFINERY], rigSize: 3 };
  const xlMfgRig = { canFitGroups: [CITADEL, EC, REFINERY], rigSize: 4 };
  const mReactionRig = { canFitGroups: [REFINERY], rigSize: 2 };
  const lReactionRig = { canFitGroups: [REFINERY], rigSize: 3 };

  const azbel = { groupId: EC, rigSize: 3 } as const; // L Engineering Complex
  const sotiyo = { groupId: EC, rigSize: 4 } as const; // XL Engineering Complex
  const raitaru = { groupId: EC, rigSize: 2 } as const; // M Engineering Complex
  const athanor = { groupId: REFINERY, rigSize: 2 } as const; // M Refinery
  const tatara = { groupId: REFINERY, rigSize: 3 } as const; // L Refinery
  const fortizar = { groupId: CITADEL, rigSize: 3 } as const; // L Citadel
  const keepstar = { groupId: CITADEL, rigSize: 4 } as const; // XL Citadel

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
