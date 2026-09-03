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

export function hostsReactions(groupId: number): boolean {
  return groupId === SDE_REFINERY_GROUP_ID;
}

export interface StructureFactors {
  structureMeFactorOf: (blueprintTypeId: number) => number;
  structureTeFactorOf: (blueprintTypeId: number) => number;
  structureCostBonusPct: number;
  manufacturingBonus: StructureBonus | null;
  reactionBonus: StructureBonus | null;
  active: boolean;
}

const NO_STRUCTURE_FACTORS: StructureFactors = {
  structureMeFactorOf: () => 1,
  structureTeFactorOf: () => 1,
  structureCostBonusPct: 0,
  manufacturingBonus: null,
  reactionBonus: null,
  active: false,
};

function securityClassFor(
  structure: AvailableStructure,
  systemSecurity: number | null,
): ReturnType<typeof systemSecurityClass> | null {
  if (structure.securityClass !== null) return structure.securityClass;
  if (systemSecurity === null) return null;
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

function routeHosts(
  buildStructure: AvailableStructure | null,
  reactionStructure: AvailableStructure | null,
): {
  mfgHost: AvailableStructure | null;
  reactionHost: AvailableStructure | null;
  mfgFromReactionSlot: boolean;
  reactionFromBuildSlot: boolean;
} {
  const mfgHost = buildStructure ?? reactionStructure;
  const buildIsRefinery = !!buildStructure && hostsReactions(buildStructure.groupId);
  const reactionHost = reactionStructure ?? (buildIsRefinery ? buildStructure : null);
  return {
    mfgHost,
    reactionHost,
    mfgFromReactionSlot: !buildStructure && !!reactionStructure,
    reactionFromBuildSlot: !reactionStructure && buildIsRefinery,
  };
}

export function structureFactorsFor(args: {
  selectedStructure: AvailableStructure | null;
  locationSecurity: number | null;
  reactionStructure?: AvailableStructure | null;
  reactionSecurity?: number | null;
  nodeActivityByBlueprint: Record<number, number>;
}): StructureFactors {
  const { selectedStructure, locationSecurity, nodeActivityByBlueprint } = args;
  const reactionStructure = args.reactionStructure ?? null;
  const reactionSecurity = args.reactionSecurity ?? null;

  const { mfgHost, reactionHost } = routeHosts(selectedStructure, reactionStructure);
  const mfgSecurity = selectedStructure ? locationSecurity : reactionSecurity;
  const reactionHostSecurity = reactionStructure ? reactionSecurity : locationSecurity;
  const manufacturingBonus = bonusFor(mfgHost, MANUFACTURING_ACTIVITY, mfgSecurity);
  const reactionBonus = bonusFor(reactionHost, REACTION_ACTIVITY, reactionHostSecurity);
  if (!manufacturingBonus && !reactionBonus) return NO_STRUCTURE_FACTORS;

  const activityOf = (bp: number) => nodeActivityByBlueprint[bp];
  return {
    structureMeFactorOf: (bp) =>
      activityOf(bp) === MANUFACTURING_ACTIVITY && manufacturingBonus
        ? 1 - manufacturingBonus.me / 100
        : 1,
    structureTeFactorOf: (bp) => {
      const activity = activityOf(bp);
      if (activity === MANUFACTURING_ACTIVITY && manufacturingBonus) return 1 - manufacturingBonus.te / 100;
      if (activity === REACTION_ACTIVITY && reactionBonus) return 1 - reactionBonus.te / 100;
      return 1;
    },
    structureCostBonusPct: manufacturingBonus?.costBonus ?? 0,
    manufacturingBonus,
    reactionBonus,
    active: true,
  };
}

/**
 * The fee inputs for assemblePricing, composed from the two location fetches +
 * the two structure slots (3.7.13.3). Pure so the provider's assemble() stays a
 * thin shell and the routing rules are unit-testable:
 *   • The mfg fee reads the BUILD slot only — a lone reaction-slot refinery
 *     "hosting the chain" (the #187 ME routing) never lends its tax to the
 *     manufacturing fee, whose index comes from the BUILD system; tax and index
 *     must not straddle two systems.
 *   • The reaction fee reads the reaction host (the refinery, else a build-slot
 *     refinery) — its inputs are the dedicated reaction-slot fetch, else the
 *     build system's own 'reaction' index (already fetched with the location).
 *   • Adjusted prices are CCP-global (the same value whichever system fetched
 *     them), so either read's map answers for the blueprint's EIV base.
 * Neither source present ⇒ undefined ⇒ the gross-only path, byte-identical.
 */
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
