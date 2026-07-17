import {
  rigFitsStructure,
  type StructureRigOption,
  type StructureTypeOption,
} from '@/data/eve-data/structures';

/** Persisted custom facility selection containing hull, rigs, tax, and user-facing name. */
export interface CustomStructureSelection {
  structureTypeId: number;
  rigTypeIds: number[];
}

/** Closed custom-structure validation result with normalized selection or field error. */
export type SelectionValidation = { ok: true } | { ok: false; reason: string };

/**
 * Server trust boundary: a saved custom structure must reference a real industry
 * structure type, and every rig must be a real industry rig that FITS that
 * structure (the structure's group in the rig's canFitGroups + matching rig size —
 * the shared rigFitsStructure rule). Pure over the SDE option lists, so the route
 * validates a forged body without trusting the client, and the branching is
 * unit-tested without a DB.
 */
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
