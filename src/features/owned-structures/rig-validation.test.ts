import { describe, expect, it } from 'vitest';
import type { StructureRigOption, StructureTypeOption } from '@/data/eve-data/structures';
import type { CorpStructureRow } from './types';
import { validateCorpStructureRigs } from './rig-validation';

// SDE groups: 1404 Engineering Complex, 1406 Refinery.
const azbel: StructureTypeOption = { typeId: 35826, name: 'Azbel', groupId: 1404, rigSize: 3 };
const TYPES = [azbel];

const lMfgRig: StructureRigOption = {
  typeId: 37170,
  name: 'L-Set Equipment Mfg Eff I',
  canFitGroups: [1657, 1404, 1406],
  rigSize: 3,
};
const mReactionRig: StructureRigOption = {
  typeId: 46490,
  name: 'M-Set Reactor Eff',
  canFitGroups: [1406],
  rigSize: 2,
};
const RIGS = [lMfgRig, mReactionRig];

function corpStructure(overrides?: Partial<CorpStructureRow>): CorpStructureRow {
  return {
    structureId: 1001,
    typeId: 35826,
    systemId: 30000142,
    securityClass: 'lowsec' as CorpStructureRow['securityClass'],
    name: 'Perimeter Fort',
    ...overrides,
  };
}

describe('validateCorpStructureRigs', () => {
  it('accepts a pulled structure with a fitting rig', () => {
    expect(validateCorpStructureRigs([corpStructure()], 1001, [37170], TYPES, RIGS)).toEqual({
      ok: true,
    });
  });

  it('accepts an empty rig list', () => {
    expect(validateCorpStructureRigs([corpStructure()], 1001, [], TYPES, RIGS)).toEqual({
      ok: true,
    });
  });

  it('rejects when the corp has no pulled structures at all', () => {
    expect(validateCorpStructureRigs(undefined, 1001, [37170], TYPES, RIGS)).toEqual({
      ok: false,
      reason: 'Unknown structure for this corporation',
    });
  });

  it('rejects a structure id the corp does not own', () => {
    expect(validateCorpStructureRigs([corpStructure()], 9999, [37170], TYPES, RIGS)).toEqual({
      ok: false,
      reason: 'Unknown structure for this corporation',
    });
  });

  it('rejects a structure whose type is not an industry structure', () => {
    const nonIndustry = corpStructure({ typeId: 12345 });
    expect(validateCorpStructureRigs([nonIndustry], 1001, [37170], TYPES, RIGS)).toEqual({
      ok: false,
      reason: 'Not an industry structure',
    });
  });

  it('rejects a rig that does not fit the structure (wrong group/size)', () => {
    expect(validateCorpStructureRigs([corpStructure()], 1001, [46490], TYPES, RIGS)).toEqual({
      ok: false,
      reason: 'One or more rigs do not fit this structure',
    });
  });

  it('rejects an unknown rig id', () => {
    expect(validateCorpStructureRigs([corpStructure()], 1001, [11111], TYPES, RIGS)).toEqual({
      ok: false,
      reason: 'One or more rigs do not fit this structure',
    });
  });

  it('rejects a mixed list where one rig fits and one does not', () => {
    expect(
      validateCorpStructureRigs([corpStructure()], 1001, [37170, 46490], TYPES, RIGS),
    ).toEqual({ ok: false, reason: 'One or more rigs do not fit this structure' });
  });
});
