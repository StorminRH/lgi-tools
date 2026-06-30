// Maps a role-paired structure selection (3.7.9.1.3) onto the per-node engine
// factors the build tree composes — pure, so the selector stays a humble shell.
//
// The model: one Engineering-Complex slot (drives MANUFACTURING nodes) and one
// Refinery slot (drives REACTION nodes). For each filled slot we compute the
// verified bonus ONCE at the current security, then map every build node to its
// activity's slot. The security a rig scales against is the structure's OWN system
// (a corp structure) or, for a custom structure, the planner's selected build
// LOCATION — never a property of the structure record. With no security known yet
// (a custom structure and no build system picked) the slot is INACTIVE, so the
// material/time/cost stay byte-identical to the no-structure path.

import { systemSecurityClass } from '@/data/eve-data/security';
import {
  computeStructureBonus,
  MANUFACTURING_ACTIVITY,
  REACTION_ACTIVITY,
  type IndustryActivityId,
  type StructureBonus,
} from './structure-bonus';
import type { AvailableStructure } from './types';

export interface SelectedStructures {
  manufacturing: AvailableStructure | null;
  reaction: AvailableStructure | null;
}

export interface StructureFactors {
  // Per-node factors fed to the engine (default 1 ⇒ no change).
  structureMeFactorOf: (blueprintTypeId: number) => number;
  structureTeFactorOf: (blueprintTypeId: number) => number;
  // The top manufacturing job's structure job-cost reduction percent (net path).
  structureCostBonusPct: number;
  // The effective bonus per slot, for the selector's readout (null when the slot
  // is empty or inactive — no security known yet).
  manufacturingBonus: StructureBonus | null;
  reactionBonus: StructureBonus | null;
  // True once at least one slot is contributing a real bonus.
  active: boolean;
}

export const NO_STRUCTURE_FACTORS: StructureFactors = {
  structureMeFactorOf: () => 1,
  structureTeFactorOf: () => 1,
  structureCostBonusPct: 0,
  manufacturingBonus: null,
  reactionBonus: null,
  active: false,
};

// The security band a structure's rigs scale against: a corp structure carries
// its own; a custom one borrows the planner's selected build-location system.
// Null (custom + no location picked) ⇒ the bonus stays inactive until a build
// system is chosen — security ALWAYS comes from a system, never a default.
function securityClassFor(
  structure: AvailableStructure,
  locationSecurity: number | null,
): ReturnType<typeof systemSecurityClass> | null {
  if (structure.securityClass !== null) return structure.securityClass;
  if (locationSecurity === null) return null;
  // The build-location picker only offers K-space NPC systems, so there is no
  // wormhole-class to pass — the security status alone resolves the band.
  return systemSecurityClass(locationSecurity, null);
}

function bonusFor(
  structure: AvailableStructure | null,
  activityId: IndustryActivityId,
  locationSecurity: number | null,
): StructureBonus | null {
  if (!structure) return null;
  const securityClass = securityClassFor(structure, locationSecurity);
  if (securityClass === null) return null;
  return computeStructureBonus({
    structureAttrs: structure.structureAttrs,
    rigAttrs: structure.rigAttrs,
    securityClass,
    activityId,
  });
}

export function structureFactorsFor(args: {
  selection: SelectedStructures;
  locationSecurity: number | null;
  nodeActivityByBlueprint: Record<number, number>;
}): StructureFactors {
  const { selection, locationSecurity, nodeActivityByBlueprint } = args;
  const manufacturingBonus = bonusFor(selection.manufacturing, MANUFACTURING_ACTIVITY, locationSecurity);
  const reactionBonus = bonusFor(selection.reaction, REACTION_ACTIVITY, locationSecurity);
  if (!manufacturingBonus && !reactionBonus) return NO_STRUCTURE_FACTORS;

  const activityOf = (bp: number) => nodeActivityByBlueprint[bp];
  return {
    // Material: ONLY manufacturing nodes get a structure ME reduction (a Refinery
    // gives reactions no ME — the recorded reaction-me=0 divergence).
    structureMeFactorOf: (bp) =>
      activityOf(bp) === MANUFACTURING_ACTIVITY && manufacturingBonus
        ? 1 - manufacturingBonus.me / 100
        : 1,
    // Time: each node's activity slot (an EC's time bonus on manufacturing jobs, a
    // Refinery's on reactions).
    structureTeFactorOf: (bp) => {
      const activity = activityOf(bp);
      if (activity === MANUFACTURING_ACTIVITY && manufacturingBonus) return 1 - manufacturingBonus.te / 100;
      if (activity === REACTION_ACTIVITY && reactionBonus) return 1 - reactionBonus.te / 100;
      return 1;
    },
    // Job cost: the net path fees the top manufacturing job only, so the cost
    // reduction is the manufacturing slot's (reactions carry no job-cost bonus).
    structureCostBonusPct: manufacturingBonus?.costBonus ?? 0,
    manufacturingBonus,
    reactionBonus,
    active: true,
  };
}
