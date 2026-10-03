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

/** Typed-in values are the game's own final numbers: applied as-is, never recomputed. */
function enteredBonusFor(
  entered: NonNullable<AvailableStructure['enteredBonuses']>,
  activityId: IndustryActivityId,
): StructureBonus {
  if (activityId === REACTION_ACTIVITY) {
    return { me: entered.reactions.me, te: entered.reactions.te, costBonus: 0 };
  }
  const { me, te, cost } = entered.manufacturing;
  return { me, te, costBonus: cost };
}

function bonusFor(
  structure: AvailableStructure | null,
  activityId: IndustryActivityId,
  systemSecurity: number | null,
): StructureBonus | null {
  if (!structure) return null;
  if (structure.enteredBonuses) return enteredBonusFor(structure.enteredBonuses, activityId);
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

  const bonusOf = (bp: number): StructureBonus | null => {
    const activity = nodeActivityByBlueprint[bp];
    if (activity === MANUFACTURING_ACTIVITY) return manufacturingBonus;
    if (activity === REACTION_ACTIVITY) return reactionBonus;
    return null;
  };
  return {
    structureMeFactorOf: (bp) => 1 - (bonusOf(bp)?.me ?? 0) / 100,
    structureTeFactorOf: (bp) => 1 - (bonusOf(bp)?.te ?? 0) / 100,
    structureCostBonusPct: manufacturingBonus?.costBonus ?? 0,
    manufacturingBonus,
    reactionBonus,
    active: true,
  };
}

/**
 * What one structure gives on its own, as the planner would apply it: typed-in
 * values as-is, otherwise hull and rigs at the given system's security.
 */
export function structureBonusesAt(
  structure: AvailableStructure,
  systemSecurity: number | null,
): StructureReadout {
  return {
    mfg: bonusFor(structure, MANUFACTURING_ACTIVITY, systemSecurity),
    rxn: hostsReactions(structure.groupId) ? bonusFor(structure, REACTION_ACTIVITY, systemSecurity) : null,
  };
}

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
  const { reactionHost } = routeHosts(buildStructure, reactionStructure);
  const reaction = reactionLocation
    ? { systemCostIndex: reactionLocation.costIndex, facilityTaxPct: reactionHost?.taxPct ?? null }
    : buildStructure && hostsReactions(buildStructure.groupId) && location
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
