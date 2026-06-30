// Pure SDE classification for Upwell structures + their industry rigs (3.7.9).
// No DB / no next/cache import, so the enumeration's branching stays unit-testable
// in isolation; the cached reads that USE these live in queries.ts.

import { RIG_MFG_MATERIAL_ATTR, RIG_REACTION_TIME_ATTR } from './constants';
import type { AttrMap } from './types';

// Which industry activity a structure / rig modifies. 1:1 with the planner's
// activity ids (manufacturing 1, reaction 11); kept as a readable string for the
// builder UI. An Engineering Complex is a manufacturing structure; a Refinery a
// reaction one.
export type StructureRole = 'manufacturing' | 'reaction';

export type StructureTypeOption = {
  typeId: number;
  name: string;
  role: StructureRole;
  // The structure's rig-size class (SDE attr 1547): 2 = M, 3 = L, 4 = XL. A rig
  // fits only when its own rig size equals this. Null only if the SDE row is
  // missing the attribute (it never is for the published structures).
  rigSize: number | null;
};

export type StructureRigOption = StructureTypeOption;

// The industry role of a structure rig from its dogma, or null when the rig is
// not an industry-efficiency rig the planner models. Reaction rigs (reactor-time
// attr) take precedence; a manufacturing-efficiency rig is one whose material-
// reduction attr is present AND nonzero — that excludes the copy / invention /
// research optimization rigs, which share the time/cost attrs but carry no
// material reduction (and don't apply to manufacturing in game).
export function structureRigRole(attrs: AttrMap): StructureRole | null {
  if (attrs[RIG_REACTION_TIME_ATTR] !== undefined) return 'reaction';
  if ((attrs[RIG_MFG_MATERIAL_ATTR] ?? 0) !== 0) return 'manufacturing';
  return null;
}

// Whether a rig fits a structure: same industry role (an Engineering Complex
// takes manufacturing rigs, a Refinery reaction rigs) AND the same rig-size class
// (M/L/XL). The single rule behind both the builder's rig picker and the save
// trust boundary, so the two can never disagree on what's valid.
export function rigFitsStructure(
  rig: { role: StructureRole; rigSize: number | null },
  structure: { role: StructureRole; rigSize: number | null },
): boolean {
  return rig.role === structure.role && rig.rigSize === structure.rigSize;
}
