import {
  rigFitsStructure,
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

  const rigById = new Map(structureRigs.map((r) => [r.typeId, r]));
  for (const rigId of selection.rigTypeIds) {
    const rig = rigById.get(rigId);
    if (!rig) return { ok: false, reason: `unknown rig ${rigId}` };
    if (!rigFitsStructure(rig, structure)) {
      return { ok: false, reason: `rig ${rigId} does not fit this structure` };
    }
  }
  return { ok: true };
}
