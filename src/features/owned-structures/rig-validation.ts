import {
  rigFitsStructure,
  type StructureRigOption,
  type StructureTypeOption,
} from '@/data/eve-data/structures';
import type { CorpStructureRow } from './types';

export type RigSelectionValidation = { ok: true } | { ok: false; reason: string };

export function validateCorpStructureRigs(
  corpStructures: CorpStructureRow[] | undefined,
  structureId: number,
  rigTypeIds: number[],
  structureTypes: StructureTypeOption[],
  structureRigs: StructureRigOption[],
): RigSelectionValidation {
  const structure = corpStructures?.find((s) => s.structureId === structureId);
  if (!structure) return { ok: false, reason: 'Unknown structure for this corporation' };
  const structureType = structureTypes.find((t) => t.typeId === structure.typeId);
  if (!structureType) return { ok: false, reason: 'Not an industry structure' };
  const fittingRigIds = new Set(
    structureRigs.filter((r) => rigFitsStructure(r, structureType)).map((r) => r.typeId),
  );
  if (rigTypeIds.some((id) => !fittingRigIds.has(id))) {
    return { ok: false, reason: 'One or more rigs do not fit this structure' };
  }
  return { ok: true };
}
