// Maps the single selected build structure (3.7.9.1.4) onto the per-node engine
// factors the build tree composes — pure, so the selector stays a humble shell.
//
// The model is ROLE-AGNOSTIC: one selected structure bonuses each build node by
// THAT node's activity. We compute the verified bonus from the SAME structure for
// both activities (manufacturing + reaction) — the structure-bonus math reads only
// the active activity's attrs and no-ops wrong-activity rigs, so a Citadel + a
// manufacturing rig bonuses manufacturing nodes (rig only, no role), and a Tatara
// fitted with both a manufacturing rig and a reaction rig bonuses BOTH a
// manufacturing node and a reaction node from one pick. Each build node is then
// mapped to its activity's bonus. The security a rig scales against is the
// structure's OWN system (a corp structure) or, for a custom structure, the
// planner's selected build LOCATION — never a property of the structure record.
// With no security known yet (a custom structure and no build system picked) both
// bonuses are null, so the material/time/cost stay byte-identical to the
// no-structure path.

import { systemSecurityClass } from '@/data/eve-data/security';
import {
  computeStructureBonus,
  MANUFACTURING_ACTIVITY,
  REACTION_ACTIVITY,
  type IndustryActivityId,
  type StructureBonus,
} from './structure-bonus';
import type { AvailableStructure } from './types';

export interface StructureFactors {
  // Per-node factors fed to the engine (default 1 ⇒ no change).
  structureMeFactorOf: (blueprintTypeId: number) => number;
  structureTeFactorOf: (blueprintTypeId: number) => number;
  // The top manufacturing job's structure job-cost reduction percent (net path).
  structureCostBonusPct: number;
  // The selected structure's effective bonus per activity, for the readout (null
  // when no structure is selected or no security is known yet). A structure can
  // contribute one or both — e.g. a Tatara fitted for both activities.
  manufacturingBonus: StructureBonus | null;
  reactionBonus: StructureBonus | null;
  // True once the selected structure is contributing a real bonus.
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
  selectedStructure: AvailableStructure | null;
  locationSecurity: number | null;
  nodeActivityByBlueprint: Record<number, number>;
}): StructureFactors {
  const { selectedStructure, locationSecurity, nodeActivityByBlueprint } = args;
  // Both bonuses come from the SAME structure — the math no-ops the wrong-activity
  // rigs, so one pick can bonus manufacturing nodes, reaction nodes, or both.
  const manufacturingBonus = bonusFor(selectedStructure, MANUFACTURING_ACTIVITY, locationSecurity);
  const reactionBonus = bonusFor(selectedStructure, REACTION_ACTIVITY, locationSecurity);
  if (!manufacturingBonus && !reactionBonus) return NO_STRUCTURE_FACTORS;

  const activityOf = (bp: number) => nodeActivityByBlueprint[bp];
  return {
    // Material: ONLY manufacturing nodes get a structure ME reduction (reactions
    // get no ME — the recorded reaction-me=0 divergence).
    structureMeFactorOf: (bp) =>
      activityOf(bp) === MANUFACTURING_ACTIVITY && manufacturingBonus
        ? 1 - manufacturingBonus.me / 100
        : 1,
    // Time: each node by its own activity (the structure's manufacturing bonus on
    // manufacturing jobs, its reaction bonus on reactions).
    structureTeFactorOf: (bp) => {
      const activity = activityOf(bp);
      if (activity === MANUFACTURING_ACTIVITY && manufacturingBonus) return 1 - manufacturingBonus.te / 100;
      if (activity === REACTION_ACTIVITY && reactionBonus) return 1 - reactionBonus.te / 100;
      return 1;
    },
    // Job cost: the net path fees the top manufacturing job only, so the cost
    // reduction is the manufacturing bonus's (reactions carry no job-cost bonus).
    structureCostBonusPct: manufacturingBonus?.costBonus ?? 0,
    manufacturingBonus,
    reactionBonus,
    active: true,
  };
}
