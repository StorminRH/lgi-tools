import {
  findUnfitRig,
  type StructureRigOption,
  type StructureTypeOption,
} from '@/data/eve-data/structures';

export interface CustomStructureSelection {
  structureTypeId: number;
  rigTypeIds: number[];
}

export type SelectionValidation = { ok: true } | { ok: false; reason: string };

export function validateCustomStructureSelection(
  selection: CustomStructureSelection,
  structureTypes: StructureTypeOption[],
  structureRigs: StructureRigOption[],
): SelectionValidation {
  const structure = structureTypes.find((t) => t.typeId === selection.structureTypeId);
  if (!structure) return { ok: false, reason: 'unknown structure type' };

  const unfit = findUnfitRig(selection.rigTypeIds, structure, structureRigs);
  if (!unfit) return { ok: true };
  const reason =
    unfit.cause === 'unknown' ? `unknown rig ${unfit.rigTypeId}` : `rig ${unfit.rigTypeId} does not fit this structure`;
  return { ok: false, reason };
}
