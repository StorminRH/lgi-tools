import { RIG_CAN_FIT_GROUP_ATTRS, STRUCTURE_RIG_SIZE_ATTR } from './constants';
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

/** The activities a production structure bonus can apply to. */
export const PRODUCTION_ACTIVITIES = ['manufacturing', 'reaction'] as const;

/** What a production bonus multiplies: a job's materials, its time, or its install cost. */
export const PRODUCTION_MODIFIER_KINDS = ['material', 'time', 'cost'] as const;

/**
 * One hull or rig bonus as the SDE resolves it: the factor it multiplies a
 * job's material, time or cost by in each security band, for jobs in its
 * target category (null = every job of that activity).
 */
export type ProductionModifier = {
  activity: (typeof PRODUCTION_ACTIVITIES)[number];
  kind: (typeof PRODUCTION_MODIFIER_KINDS)[number];
  filterId: number | null;
  factor: { high: number; low: number; null: number };
};

/** One of CCP's industry target filters: a product class hull and rig bonuses aim at. */
export type TargetFilter = {
  id: number;
  name: string;
  categoryIds: readonly number[];
  groupIds: readonly number[];
};

/** The target filters a product belongs to, by its group or its group's category. */
export function matchingFilterIds(
  filters: readonly TargetFilter[],
  product: { groupId: number; categoryId: number },
): number[] {
  return filters
    .filter((f) => f.groupIds.includes(product.groupId) || f.categoryIds.includes(product.categoryId))
    .map((f) => f.id);
}

export function attainableFilterSets(
  filters: readonly TargetFilter[],
  groups: readonly { groupId: number; categoryId: number }[],
): number[][] {
  const sets = new Map<string, number[]>();
  for (const group of groups) {
    const ids = matchingFilterIds(filters, group).sort((a, b) => a - b);
    sets.set(ids.join(','), ids);
  }
  return [...sets.values()];
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
  rows: ReadonlyArray<{ id: number; name: string; attributes: AttrMap | null }>,
): StructureRigOption[] {
  const out: StructureRigOption[] = [];
  for (const r of rows) {
    const attrs = r.attributes ?? {};
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

/**
 * Whether a module fits a hull, by CCP's fitting rule: the hull's type is one
 * of the module's canFitShipType values, or its group one of its
 * canFitShipGroup values.
 */
export function moduleFitsHull(
  moduleAttrs: AttrMap,
  fitAttrIds: { types: readonly number[]; groups: readonly number[] },
  hull: { typeId: number; groupId: number },
): boolean {
  const values = (ids: readonly number[]) => ids.flatMap((id) => moduleAttrs[id] ?? []);
  return values(fitAttrIds.types).includes(hull.typeId) || values(fitAttrIds.groups).includes(hull.groupId);
}
