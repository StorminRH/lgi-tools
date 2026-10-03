import { SDE_REFINERY_GROUP_ID } from '@/data/eve-data/constants';
import { systemSecurityClass } from '@/data/eve-data/security';
import type { AssembleOptions } from './build-pricing';
import {
  computeStructureBonus,
  headlineStructureBonus,
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

/** One job's categories, or the best any category gets when no job is in view. */
type BonusScope = { filterIds: readonly number[] } | 'headline';

function bonusFor(
  structure: AvailableStructure | null,
  activityId: IndustryActivityId,
  systemSecurity: number | null,
  scope: BonusScope,
): StructureBonus | null {
  if (!structure) return null;
  if (structure.enteredBonuses) return enteredBonusFor(structure.enteredBonuses, activityId);
  const securityClass = securityClassFor(structure, systemSecurity);
  if (securityClass === null) return null;
  const input = { modifiers: structure.modifiers, securityClass, activityId };
  return scope === 'headline'
    ? headlineStructureBonus({ ...input, filterSets: structure.targetFilterSets })
    : computeStructureBonus({ ...input, filterIds: scope.filterIds });
}

function bestOf(bonuses: readonly StructureBonus[]): StructureBonus | null {
  if (bonuses.length === 0) return null;
  return {
    me: Math.max(...bonuses.map((b) => b.me)),
    te: Math.max(...bonuses.map((b) => b.te)),
    costBonus: Math.max(...bonuses.map((b) => b.costBonus)),
  };
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

/**
 * The structure bonus on every job in a build. Each job takes the host for its
 * activity and gets only the hull and rig bonuses aimed at its own category.
 * The readouts are the most any job of that activity in this build gets.
 */
export function structureFactorsFor(args: {
  selectedStructure: AvailableStructure | null;
  locationSecurity: number | null;
  reactionStructure?: AvailableStructure | null;
  reactionSecurity?: number | null;
  nodeActivityByBlueprint: Record<number, number>;
  nodeFilterIds: Record<number, number[]>;
  topBlueprintTypeId: number;
}): StructureFactors {
  const { selectedStructure, locationSecurity, nodeActivityByBlueprint, nodeFilterIds } = args;
  const reactionStructure = args.reactionStructure ?? null;
  const reactionSecurity = args.reactionSecurity ?? null;

  const { mfgHost, reactionHost } = routeHosts(selectedStructure, reactionStructure);
  const hosts: Record<IndustryActivityId, { structure: AvailableStructure | null; security: number | null }> = {
    [MANUFACTURING_ACTIVITY]: { structure: mfgHost, security: selectedStructure ? locationSecurity : reactionSecurity },
    [REACTION_ACTIVITY]: { structure: reactionHost, security: reactionStructure ? reactionSecurity : locationSecurity },
  };
  const memo = new Map<number, StructureBonus | null>();
  const bonusOf = (bp: number): StructureBonus | null => {
    if (memo.has(bp)) return memo.get(bp) ?? null;
    const activity = nodeActivityByBlueprint[bp];
    const host = activity === MANUFACTURING_ACTIVITY || activity === REACTION_ACTIVITY ? hosts[activity] : null;
    const bonus = host ? bonusFor(host.structure, activity as IndustryActivityId, host.security, { filterIds: nodeFilterIds[bp] ?? [] }) : null;
    memo.set(bp, bonus);
    return bonus;
  };
  // With no job of the activity in this build, the readout falls back to the
  // structure's best category, as it reads before any job is chosen.
  const bestFor = (activity: IndustryActivityId) => {
    const jobs = Object.entries(nodeActivityByBlueprint).filter(([, act]) => act === activity);
    if (jobs.length === 0) return bonusFor(hosts[activity].structure, activity, hosts[activity].security, 'headline');
    return bestOf(jobs.flatMap(([bp]) => bonusOf(Number(bp)) ?? []));
  };
  const manufacturingBonus = bestFor(MANUFACTURING_ACTIVITY);
  const reactionBonus = bestFor(REACTION_ACTIVITY);
  if (!manufacturingBonus && !reactionBonus) return NO_STRUCTURE_FACTORS;

  return {
    structureMeFactorOf: (bp) => 1 - (bonusOf(bp)?.me ?? 0) / 100,
    structureTeFactorOf: (bp) => 1 - (bonusOf(bp)?.te ?? 0) / 100,
    structureCostBonusPct: bonusOf(args.topBlueprintTypeId)?.costBonus ?? 0,
    manufacturingBonus,
    reactionBonus,
    active: true,
  };
}

/**
 * What one structure gives on its own, before any job is chosen: typed-in values
 * as-is, otherwise the best its hull and rigs give any category at the system's
 * security.
 */
export function structureBonusesAt(
  structure: AvailableStructure,
  systemSecurity: number | null,
): StructureReadout {
  return {
    mfg: bonusFor(structure, MANUFACTURING_ACTIVITY, systemSecurity, 'headline'),
    rxn: hostsReactions(structure.groupId) ? bonusFor(structure, REACTION_ACTIVITY, systemSecurity, 'headline') : null,
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
