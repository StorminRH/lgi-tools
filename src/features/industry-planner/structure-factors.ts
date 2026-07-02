// Maps up to two selected build structures onto the per-node engine factors the
// build tree composes — pure, so the selectors stay humble shells.
//
// The model is ROLE-AGNOSTIC per node but SMART across two slots (3.7.12.2):
//   • a "build" structure (any group) — the manufacturing host, and
//   • a "reaction" refinery — the reaction host.
// The routing derives the roles from what's selected, not from a fixed slot:
//   – Reactions build in the refinery if one is selected, else in the build
//     structure when it is itself a refinery, else get no structure bonus.
//   – Manufacturing builds in the build structure if one is selected, else in a
//     lone refinery (so one refinery can do the whole chain).
// The structure-bonus math reads only the active activity's attrs and no-ops
// wrong-activity rigs, so a Tatara fitted for both activities bonuses both a
// manufacturing node and a reaction node. The security a rig scales against is the
// structure's OWN system (a corp structure) or, for a custom structure, that slot's
// selected system — never a property of the structure record. With no security known
// yet (a custom structure and no system picked) its bonus is null, so material/time/
// cost stay byte-identical to the no-structure path.

import { SDE_REFINERY_GROUP_ID } from '@/data/eve-data/constants';
import { systemSecurityClass } from '@/data/eve-data/security';
import type { AssembleOptions } from './build-pricing';
import {
  computeStructureBonus,
  MANUFACTURING_ACTIVITY,
  REACTION_ACTIVITY,
  type IndustryActivityId,
  type StructureBonus,
} from './structure-bonus';
import type { AvailableStructure } from './types';

// COVERAGE (distinct from BONUS): which activities a structure can HOST, decided by
// its SDE group — only a Refinery (1406) hosts reactions; every industry structure
// hosts manufacturing. A structure that hosts an activity but lacks its rigs still
// covers it at zero bonus — coverage is group-level, bonus is rig/role-level.
export function hostsReactions(groupId: number): boolean {
  return groupId === SDE_REFINERY_GROUP_ID;
}

export interface StructureFactors {
  // Per-node factors fed to the engine (default 1 ⇒ no change).
  structureMeFactorOf: (blueprintTypeId: number) => number;
  structureTeFactorOf: (blueprintTypeId: number) => number;
  // The top manufacturing job's structure job-cost reduction percent (net path).
  structureCostBonusPct: number;
  // The bonus the manufacturing / reaction HOST contributes (null when that activity
  // has no host or no security yet). `structureReadouts` splits these back to slots.
  manufacturingBonus: StructureBonus | null;
  reactionBonus: StructureBonus | null;
  // True once some structure is contributing a real bonus.
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
// its own; a custom one borrows its slot's selected system. Null (custom + no system
// picked) ⇒ the bonus stays inactive until a system is chosen — security ALWAYS comes
// from a system, never a default.
function securityClassFor(
  structure: AvailableStructure,
  systemSecurity: number | null,
): ReturnType<typeof systemSecurityClass> | null {
  if (structure.securityClass !== null) return structure.securityClass;
  if (systemSecurity === null) return null;
  // No wormhole-class to pass: the picker offers the whole universe (3.7.13.2),
  // but a J-space system's ≤0 security lands on the 'null' band, which shares
  // the wormhole rig multiplier — the number is identical, only the band label
  // differs (see SECURITY_CLASSES).
  return systemSecurityClass(systemSecurity, null);
}

function bonusFor(
  structure: AvailableStructure | null,
  activityId: IndustryActivityId,
  systemSecurity: number | null,
): StructureBonus | null {
  if (!structure) return null;
  const securityClass = securityClassFor(structure, systemSecurity);
  if (securityClass === null) return null;
  return computeStructureBonus({
    structureAttrs: structure.structureAttrs,
    rigAttrs: structure.rigAttrs,
    securityClass,
    activityId,
  });
}

// Which structure hosts each activity, per the smart routing. Pure over the two picks.
function routeHosts(
  buildStructure: AvailableStructure | null,
  reactionStructure: AvailableStructure | null,
): {
  mfgHost: AvailableStructure | null;
  reactionHost: AvailableStructure | null;
  mfgFromReactionSlot: boolean;
  reactionFromBuildSlot: boolean;
} {
  // Manufacturing: the build structure, else a lone refinery does the whole chain.
  const mfgHost = buildStructure ?? reactionStructure;
  // Reactions: the refinery, else the build structure when it is itself a refinery.
  const buildIsRefinery = !!buildStructure && hostsReactions(buildStructure.groupId);
  const reactionHost = reactionStructure ?? (buildIsRefinery ? buildStructure : null);
  return {
    mfgHost,
    reactionHost,
    // A lone refinery in the reaction slot also does manufacturing.
    mfgFromReactionSlot: !buildStructure && !!reactionStructure,
    // The build structure hosts reactions only when it's a refinery and no dedicated
    // reaction refinery is picked.
    reactionFromBuildSlot: !reactionStructure && buildIsRefinery,
  };
}

export function structureFactorsFor(args: {
  // The "build at" structure (any group) + its system security.
  selectedStructure: AvailableStructure | null;
  locationSecurity: number | null;
  // The dedicated "react at" refinery + its OWN system security. Omitted / null ⇒
  // reactions fall back to the build structure when it's a refinery (byte-identical to
  // the single-structure path for every group).
  reactionStructure?: AvailableStructure | null;
  reactionSecurity?: number | null;
  nodeActivityByBlueprint: Record<number, number>;
}): StructureFactors {
  const { selectedStructure, locationSecurity, nodeActivityByBlueprint } = args;
  const reactionStructure = args.reactionStructure ?? null;
  const reactionSecurity = args.reactionSecurity ?? null;

  const { mfgHost, reactionHost } = routeHosts(selectedStructure, reactionStructure);
  // Each host scales against its OWN system's security.
  const mfgSecurity = selectedStructure ? locationSecurity : reactionSecurity;
  const reactionHostSecurity = reactionStructure ? reactionSecurity : locationSecurity;
  const manufacturingBonus = bonusFor(mfgHost, MANUFACTURING_ACTIVITY, mfgSecurity);
  const reactionBonus = bonusFor(reactionHost, REACTION_ACTIVITY, reactionHostSecurity);
  if (!manufacturingBonus && !reactionBonus) return NO_STRUCTURE_FACTORS;

  const activityOf = (bp: number) => nodeActivityByBlueprint[bp];
  return {
    // Material: ONLY manufacturing nodes get a structure ME reduction (reactions get
    // no ME — the recorded reaction-me=0 divergence).
    structureMeFactorOf: (bp) =>
      activityOf(bp) === MANUFACTURING_ACTIVITY && manufacturingBonus
        ? 1 - manufacturingBonus.me / 100
        : 1,
    // Time: manufacturing nodes get the manufacturing host's bonus; reaction nodes get
    // the reaction host's.
    structureTeFactorOf: (bp) => {
      const activity = activityOf(bp);
      if (activity === MANUFACTURING_ACTIVITY && manufacturingBonus) return 1 - manufacturingBonus.te / 100;
      if (activity === REACTION_ACTIVITY && reactionBonus) return 1 - reactionBonus.te / 100;
      return 1;
    },
    // Job cost: the net path fees the top manufacturing job only, so the cost reduction
    // is the manufacturing host's (reactions carry no job-cost bonus).
    structureCostBonusPct: manufacturingBonus?.costBonus ?? 0,
    manufacturingBonus,
    reactionBonus,
    active: true,
  };
}

// The fee inputs for assemblePricing, composed from the two location fetches +
// the two structure slots (3.7.13.3). Pure so the provider's assemble() stays a
// thin shell and the routing rules are unit-testable:
//   • The mfg fee reads the BUILD slot only — a lone reaction-slot refinery
//     "hosting the chain" (the #187 ME routing) never lends its tax to the
//     manufacturing fee, whose index comes from the BUILD system; tax and index
//     must not straddle two systems.
//   • The reaction fee reads the reaction host (the refinery, else a build-slot
//     refinery) — its inputs are the dedicated reaction-slot fetch, else the
//     build system's own 'reaction' index (already fetched with the location).
//   • Adjusted prices are CCP-global (the same value whichever system fetched
//     them), so either read's map answers for the blueprint's EIV base.
// Neither source present ⇒ undefined ⇒ the gross-only path, byte-identical.
export function composeFeeInputs(args: {
  location: {
    adjustedPrices: Map<number, number>;
    costIndices: { manufacturing: number | null; reaction: number | null };
  } | null;
  reactionLocation: { costIndex: number | null; adjustedPrices: Map<number, number> } | null;
  buildStructure: AvailableStructure | null;
  reactionStructure: AvailableStructure | null;
  structureCostBonusPct: number;
}): AssembleOptions['fee'] {
  const { location, reactionLocation, buildStructure, reactionStructure } = args;
  const buildIsRefinery = !!buildStructure && hostsReactions(buildStructure.groupId);
  const reactionHost = reactionStructure ?? (buildIsRefinery ? buildStructure : null);
  const reaction = reactionLocation
    ? { systemCostIndex: reactionLocation.costIndex, facilityTaxPct: reactionHost?.taxPct ?? null }
    : buildIsRefinery && location
      ? { systemCostIndex: location.costIndices.reaction ?? null, facilityTaxPct: buildStructure.taxPct }
      : undefined;
  if (!location && !reaction) return undefined;
  return {
    adjustedPriceOf: (id: number) =>
      location?.adjustedPrices.get(id) ?? reactionLocation?.adjustedPrices.get(id) ?? null,
    systemCostIndex: location?.costIndices.manufacturing ?? null,
    structureCostBonusPct: args.structureCostBonusPct,
    facilityTaxPct: buildStructure?.taxPct ?? null,
    reaction,
  };
}

// The bonuses each SLOT is contributing, for its readout pills — split from the host
// bonuses by the same routing. A slot shows a pill only for an activity it actually
// hosts (so the "build" slot never shows a reaction pill when a refinery took over
// reactions, and a lone refinery in either slot shows both).
export interface StructureReadout {
  mfg: StructureBonus | null;
  rxn: StructureBonus | null;
}

export function structureReadouts(args: {
  selectedStructure: AvailableStructure | null;
  reactionStructure: AvailableStructure | null;
  factors: StructureFactors;
}): { build: StructureReadout; reaction: StructureReadout } {
  const { selectedStructure, reactionStructure, factors } = args;
  const { mfgFromReactionSlot, reactionFromBuildSlot } = routeHosts(selectedStructure, reactionStructure);
  return {
    build: {
      mfg: selectedStructure ? factors.manufacturingBonus : null,
      rxn: reactionFromBuildSlot ? factors.reactionBonus : null,
    },
    reaction: {
      mfg: mfgFromReactionSlot ? factors.manufacturingBonus : null,
      rxn: reactionStructure ? factors.reactionBonus : null,
    },
  };
}
