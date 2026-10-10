import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY, type IndustryActivityId } from '../structure-bonus';

/**
 * The production categories a profile assigns facilities and characters to,
 * built on CCP's industry target filters (the product classes hull and rig
 * bonuses aim at), grouped top-down. A job takes the most specific category
 * anyone covers: its own leaf, then its group, then all manufacturing.
 */
export const CATEGORY_KEYS = [
  'manufacturing',
  'ships',
  'small-t1-ships',
  'small-t2-ships',
  'medium-t1-ships',
  'medium-t2-ships',
  'large-t1-ships',
  'large-t2-ships',
  'capital-ships',
  'components',
  'advanced-components',
  'capital-components',
  'advanced-capital-components',
  'equipment',
  'modules',
  'charges',
  'drones-fighters',
  'structures',
  'reactions',
  'composite-reactions',
  'hybrid-reactions',
  'biochemical-reactions',
] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** CCP's capital ships target filter: the hulls only a structure with a capital shipyard builds. */
export const CAPITAL_SHIPS_FILTER_ID = 11;

export interface CategoryLeaf {
  key: CategoryKey;
  /** Short, under its group's heading. */
  label: string;
  /** On its own, as in a summary line. Starts with `label`, since it names the checklist box that shows `label`. */
  name: string;
  /** CCP's industry target filter this leaf is. */
  filterId: number;
}

export interface CategoryGroup {
  key: CategoryKey;
  label: string;
  name: string;
  activity: IndustryActivityId;
  /** A job belongs to the group when it matches this filter, or any leaf. */
  filterId: number | null;
  leaves: readonly CategoryLeaf[];
}

export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  {
    key: 'ships',
    label: 'Ships',
    name: 'All ships',
    activity: MANUFACTURING_ACTIVITY,
    filterId: 3,
    leaves: [
      { key: 'small-t1-ships', label: 'Small T1', name: 'Small T1 ships', filterId: 5 },
      { key: 'small-t2-ships', label: 'Small T2', name: 'Small T2 ships', filterId: 6 },
      { key: 'medium-t1-ships', label: 'Medium T1', name: 'Medium T1 ships', filterId: 7 },
      { key: 'medium-t2-ships', label: 'Medium T2', name: 'Medium T2 ships', filterId: 8 },
      { key: 'large-t1-ships', label: 'Large T1', name: 'Large T1 ships', filterId: 9 },
      { key: 'large-t2-ships', label: 'Large T2', name: 'Large T2 ships', filterId: 10 },
      { key: 'capital-ships', label: 'Capital', name: 'Capital ships', filterId: CAPITAL_SHIPS_FILTER_ID },
    ],
  },
  {
    key: 'components',
    label: 'Components',
    name: 'All components',
    activity: MANUFACTURING_ACTIVITY,
    filterId: null,
    leaves: [
      { key: 'advanced-components', label: 'Advanced', name: 'Advanced components', filterId: 14 },
      { key: 'capital-components', label: 'Capital', name: 'Capital components', filterId: 13 },
      { key: 'advanced-capital-components', label: 'Advanced capital', name: 'Advanced capital components', filterId: 15 },
    ],
  },
  {
    key: 'equipment',
    label: 'Equipment & consumables',
    name: 'All equipment & consumables',
    activity: MANUFACTURING_ACTIVITY,
    filterId: null,
    leaves: [
      { key: 'modules', label: 'Equipment', name: 'Equipment', filterId: 2 },
      { key: 'charges', label: 'Charges', name: 'Charges', filterId: 4 },
      { key: 'drones-fighters', label: 'Drones & fighters', name: 'Drones & fighters', filterId: 1 },
    ],
  },
  {
    key: 'structures',
    label: 'Structures',
    name: 'Structures',
    activity: MANUFACTURING_ACTIVITY,
    filterId: 12,
    leaves: [],
  },
  {
    key: 'reactions',
    label: 'Reactions',
    name: 'All reactions',
    activity: REACTION_ACTIVITY,
    filterId: null,
    leaves: [
      { key: 'composite-reactions', label: 'Composite', name: 'Composite reactions', filterId: 18 },
      { key: 'hybrid-reactions', label: 'Hybrid', name: 'Hybrid reactions', filterId: 16 },
      { key: 'biochemical-reactions', label: 'Biochemical', name: 'Biochemical reactions', filterId: 17 },
    ],
  },
];

/** Every manufacturing job, below anything more specific. */
export const ALL_MANUFACTURING: CategoryKey = 'manufacturing';

const NAMES = new Map<CategoryKey, string>([
  [ALL_MANUFACTURING, 'All manufacturing'],
  ...CATEGORY_GROUPS.flatMap((g): [CategoryKey, string][] => [
    [g.key, g.name],
    ...g.leaves.map((l): [CategoryKey, string] => [l.key, l.name]),
  ]),
]);

/** A category's name on its own, as in a summary line. */
export function categoryName(key: CategoryKey): string {
  return NAMES.get(key) ?? key;
}

function groupMatches(group: CategoryGroup, filterIds: readonly number[]): boolean {
  if (group.filterId !== null && filterIds.includes(group.filterId)) return true;
  return group.leaves.some((leaf) => filterIds.includes(leaf.filterId));
}

/**
 * The categories a job falls under, most specific first: its leaves, then its
 * group, then all manufacturing for a manufacturing job.
 */
export function jobCategories(activityId: number, filterIds: readonly number[]): CategoryKey[][] {
  const groups = CATEGORY_GROUPS.filter((g) => g.activity === activityId && groupMatches(g, filterIds));
  const leaves = groups.flatMap((g) => g.leaves.filter((l) => filterIds.includes(l.filterId)).map((l) => l.key));
  const levels: CategoryKey[][] = [leaves, groups.map((g) => g.key)];
  if (activityId === MANUFACTURING_ACTIVITY) levels.push([ALL_MANUFACTURING]);
  return levels.filter((level) => level.length > 0);
}

/**
 * Whoever covers a job: the owners assigned at its most specific covered
 * level. Several owners can share a level; the caller picks the best of them.
 */
export function coveringOwners<T extends { categories: readonly CategoryKey[] }>(
  owners: readonly T[],
  activityId: number,
  filterIds: readonly number[],
): T[] {
  for (const level of jobCategories(activityId, filterIds)) {
    const covering = owners.filter((o) => o.categories.some((c) => level.includes(c)));
    if (covering.length > 0) return covering;
  }
  return [];
}
