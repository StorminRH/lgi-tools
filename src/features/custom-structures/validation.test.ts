import { describe, expect, it } from 'vitest';
import type { StructureRigOption, StructureTypeOption } from '@/data/eve-data/structures';
import { validateCustomStructureSelection } from './validation';

const azbel: StructureTypeOption = { typeId: 35826, name: 'Azbel', role: 'manufacturing', rigSize: 3 };
const athanor: StructureTypeOption = { typeId: 35835, name: 'Athanor', role: 'reaction', rigSize: 2 };
const TYPES = [azbel, athanor];

const lMfgRig: StructureRigOption = { typeId: 37170, name: 'L-Set Equipment Mfg Eff I', role: 'manufacturing', rigSize: 3 };
const mMfgRig: StructureRigOption = { typeId: 43866, name: 'M-Set Mfg Mat Eff', role: 'manufacturing', rigSize: 2 };
const mReactionRig: StructureRigOption = { typeId: 46490, name: 'M-Set Reactor Eff', role: 'reaction', rigSize: 2 };
const RIGS = [lMfgRig, mMfgRig, mReactionRig];

describe('validateCustomStructureSelection', () => {
  it('accepts a real structure with a fitting (same role + size) rig', () => {
    expect(validateCustomStructureSelection({ structureTypeId: 35826, rigTypeIds: [37170] }, TYPES, RIGS)).toEqual({
      ok: true,
    });
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

  it('rejects a rig of the wrong role (reaction rig on a manufacturing structure)', () => {
    const r = validateCustomStructureSelection({ structureTypeId: 35826, rigTypeIds: [46490] }, TYPES, RIGS);
    expect(r.ok).toBe(false);
  });

  it('rejects a rig of the wrong size (M-set rig on an L structure)', () => {
    const r = validateCustomStructureSelection({ structureTypeId: 35826, rigTypeIds: [43866] }, TYPES, RIGS);
    expect(r.ok).toBe(false);
  });
});
