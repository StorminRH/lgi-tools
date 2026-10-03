import type { SecurityClass } from '@/data/eve-data/security';
import type { StructureModifier } from './api-contract';

export type { SecurityClass };

export const MANUFACTURING_ACTIVITY = 1;
export const REACTION_ACTIVITY = 11;
export type IndustryActivityId = typeof MANUFACTURING_ACTIVITY | typeof REACTION_ACTIVITY;

export interface StructureBonus {
  me: number;
  te: number;
  costBonus: number;
}

const ACTIVITY_KEY: Record<IndustryActivityId, StructureModifier['activity']> = {
  [MANUFACTURING_ACTIVITY]: 'manufacturing',
  [REACTION_ACTIVITY]: 'reaction',
};

/** Wormholes take the null-sec band, as the game does. */
function band(sec: SecurityClass): keyof StructureModifier['factor'] {
  return sec === 'wormhole' ? 'null' : sec;
}

function reductionPct(factors: number[]): number {
  return (1 - factors.reduce((product, f) => product * f, 1)) * 100;
}

/**
 * What a structure gives one job: every hull and rig bonus for the job's
 * activity whose target is "everything" or one of the job's categories, at the
 * system's security band, stacked multiplicatively.
 */
export function computeStructureBonus(input: {
  modifiers: readonly StructureModifier[];
  securityClass: SecurityClass;
  activityId: IndustryActivityId;
  filterIds: readonly number[];
}): StructureBonus {
  const activity = ACTIVITY_KEY[input.activityId];
  const at = band(input.securityClass);
  const applies = input.modifiers.filter(
    (m) => m.activity === activity && (m.filterId === null || input.filterIds.includes(m.filterId)),
  );
  const factorsOf = (kind: StructureModifier['kind']) => applies.filter((m) => m.kind === kind).map((m) => m.factor[at]);
  return {
    me: reductionPct(factorsOf('material')),
    te: reductionPct(factorsOf('time')),
    costBonus: reductionPct(factorsOf('cost')),
  };
}

/**
 * The most a structure gives any one category, metric by metric: the summary a
 * list shows before a job is chosen. A category its rigs target reads at full
 * strength; with no rigs it is the hull alone.
 */
export function headlineStructureBonus(input: {
  modifiers: readonly StructureModifier[];
  securityClass: SecurityClass;
  activityId: IndustryActivityId;
  filterSets: readonly (readonly number[])[];
}): StructureBonus {
  const candidates = [[], ...input.filterSets].map((filterIds) =>
    computeStructureBonus({ ...input, filterIds }),
  );
  return {
    me: Math.max(...candidates.map((c) => c.me)),
    te: Math.max(...candidates.map((c) => c.te)),
    costBonus: Math.max(...candidates.map((c) => c.costBonus)),
  };
}
