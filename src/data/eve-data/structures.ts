import {
  RIG_CAN_FIT_GROUP_ATTRS,
  RIG_MFG_MATERIAL_ATTR,
  RIG_REACTION_TIME_ATTR,
  STRUCTURE_RIG_SIZE_ATTR,
} from './constants';
import type { AttrMap } from './types';

export type StructureTypeOption = {
  typeId: number;
  name: string;
  groupId: number;
  rigSize: number | null;
};

export type StructureRigOption = {
  typeId: number;
  name: string;
  canFitGroups: number[];
  rigSize: number | null;
};

export function isIndustryRig(attrs: AttrMap): boolean {
  if (attrs[RIG_REACTION_TIME_ATTR] !== undefined) return true;
  return (attrs[RIG_MFG_MATERIAL_ATTR] ?? 0) !== 0;
}

/**
 * Whether a rig physically fits a structure: CCP's actual fitting rule, not a
 * "role". The structure's group id must be one of the rig's canFitShipGroup ids
 * AND the rig-size class (M/L/XL) must match. A manufacturing rig fits an
 * Engineering Complex, a Refinery, or a Citadel; a reaction rig fits a Refinery
 * only. The single rule behind both the builder's rig picker and the save trust
 * boundary, so the two can never disagree on what's valid.
 */
export function rigFitsStructure(
  rig: { canFitGroups: number[]; rigSize: number | null },
  structure: { groupId: number; rigSize: number | null },
): boolean {
  return rig.canFitGroups.includes(structure.groupId) && rig.rigSize === structure.rigSize;
}

export function shapeStructureRigs(
  rows: ReadonlyArray<{ id: number; name: string; attributes: unknown }>,
): StructureRigOption[] {
  const out: StructureRigOption[] = [];
  for (const r of rows) {
    const attrs = (r.attributes ?? {}) as AttrMap;
    if (!isIndustryRig(attrs)) continue;
    const canFitGroups = RIG_CAN_FIT_GROUP_ATTRS.map((a) => attrs[a]).filter(
      (g): g is number => g !== undefined,
    );
    out.push({
      typeId: r.id,
      name: r.name,
      canFitGroups,
      rigSize: attrs[STRUCTURE_RIG_SIZE_ATTR] ?? null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
