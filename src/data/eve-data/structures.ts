// Pure SDE classification for Upwell structures + their industry rigs (3.7.9).
// No DB / no next/cache import, so the enumeration's branching stays unit-testable
// in isolation; the cached reads that USE these live in queries.ts.

import { RIG_MFG_MATERIAL_ATTR, RIG_REACTION_TIME_ATTR } from './constants';
import type { AttrMap } from './types';

export type StructureTypeOption = {
  typeId: number;
  name: string;
  // The structure's SDE group id (1404 Engineering Complex, 1406 Refinery, 1657
  // Citadel). A rig fits when one of its canFitShipGroup attrs equals this.
  groupId: number;
  // The structure's rig-size class (SDE attr 1547): 2 = M, 3 = L, 4 = XL. A rig
  // fits only when its own rig size equals this. Null only if the SDE row is
  // missing the attribute (it never is for the published structures).
  rigSize: number | null;
};

export type StructureRigOption = {
  typeId: number;
  name: string;
  // The structure group ids this rig can be fitted to (CCP's canFitShipGroup01/02/03,
  // dogma attrs 1298/1299/1300): manufacturing rigs carry {1404, 1406, 1657};
  // reaction rigs carry {1406} only.
  canFitGroups: number[];
  rigSize: number | null;
};

// Whether a rig is an industry-efficiency rig the planner models, from its dogma.
// Reaction rigs carry the reactor-time attr; a manufacturing rig is one whose
// material-reduction attr is present AND nonzero — that excludes the copy /
// invention / research optimization rigs, which share the time/cost attrs but
// carry no material reduction (and must not speed up a manufacturing build).
export function isIndustryRig(attrs: AttrMap): boolean {
  if (attrs[RIG_REACTION_TIME_ATTR] !== undefined) return true;
  return (attrs[RIG_MFG_MATERIAL_ATTR] ?? 0) !== 0;
}

// Whether a rig physically fits a structure: CCP's actual fitting rule, not a
// "role". The structure's group id must be one of the rig's canFitShipGroup ids
// AND the rig-size class (M/L/XL) must match. A manufacturing rig fits an
// Engineering Complex, a Refinery, or a Citadel; a reaction rig fits a Refinery
// only. The single rule behind both the builder's rig picker and the save trust
// boundary, so the two can never disagree on what's valid.
export function rigFitsStructure(
  rig: { canFitGroups: number[]; rigSize: number | null },
  structure: { groupId: number; rigSize: number | null },
): boolean {
  return rig.canFitGroups.includes(structure.groupId) && rig.rigSize === structure.rigSize;
}
