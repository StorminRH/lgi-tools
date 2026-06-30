import { describe, expect, it } from 'vitest';
import type { StructureRigOption, StructureTypeOption } from '@/data/eve-data/structures';
import { validateCustomStructureSelection } from './validation';

// SDE groups: 1404 Engineering Complex, 1406 Refinery, 1657 Citadel.
const azbel: StructureTypeOption = { typeId: 35826, name: 'Azbel', groupId: 1404, rigSize: 3 };
const athanor: StructureTypeOption = { typeId: 35835, name: 'Athanor', groupId: 1406, rigSize: 2 };
const fortizar: StructureTypeOption = { typeId: 35833, name: 'Fortizar', groupId: 1657, rigSize: 3 };
const TYPES = [azbel, athanor, fortizar];

// Manufacturing rigs fit EC + Refinery + Citadel; reaction rigs fit Refinery only.
const lMfgRig: StructureRigOption = {
  typeId: 37170,
  name: 'L-Set Equipment Mfg Eff I',
  canFitGroups: [1657, 1404, 1406],
  rigSize: 3,
};
const mMfgRig: StructureRigOption = {
  typeId: 43866,
  name: 'M-Set Mfg Mat Eff',
  canFitGroups: [1657, 1404, 1406],
  rigSize: 2,
};
const mReactionRig: StructureRigOption = {
  typeId: 46490,
  name: 'M-Set Reactor Eff',
  canFitGroups: [1406],
  rigSize: 2,
};
const RIGS = [lMfgRig, mMfgRig, mReactionRig];

describe('validateCustomStructureSelection', () => {
  it('accepts a real structure with a fitting rig (group in canFitGroups + size)', () => {
    expect(validateCustomStructureSelection({ structureTypeId: 35826, rigTypeIds: [37170] }, TYPES, RIGS)).toEqual({
      ok: true,
    });
  });

  it('accepts a manufacturing rig on a Citadel (no role, but the rig fits)', () => {
    expect(
      validateCustomStructureSelection({ structureTypeId: 35833, rigTypeIds: [37170] }, TYPES, RIGS).ok,
    ).toBe(true);
  });

  it('accepts an empty rig list', () => {
    expect(validateCustomStructureSelection({ structureTypeId: 35826, rigTypeIds: [] }, TYPES, RIGS).ok).toBe(true);
  });

  it('rejects an unknown structure type', () => {
    const r = validateCustomStructureSelection({ structureTypeId: 99999, rigTypeIds: [] }, TYPES, RIGS);
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown rig', () => {
    const r = validateCustomStructureSelection({ structureTypeId: 35826, rigTypeIds: [11111] }, TYPES, RIGS);
    expect(r.ok).toBe(false);
  });

  it('rejects a reaction rig on an Engineering Complex (EC not in canFitGroups)', () => {
    const r = validateCustomStructureSelection({ structureTypeId: 35826, rigTypeIds: [46490] }, TYPES, RIGS);
    expect(r.ok).toBe(false);
  });

  it('rejects a rig of the wrong size (M-set rig on an L structure)', () => {
    const r = validateCustomStructureSelection({ structureTypeId: 35826, rigTypeIds: [43866] }, TYPES, RIGS);
    expect(r.ok).toBe(false);
  });
});
