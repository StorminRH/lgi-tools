import { matchStations, type StationSearchEntry } from '@/data/eve-data/stations-search';
import {
  ALL_MANUFACTURING,
  CATEGORY_GROUPS,
  type CategoryKey,
} from '@/features/industry-planner/profiles/production-categories';
import {
  facilityKey,
  type ProfileDocument,
  type ProfileFacility,
} from '@/features/industry-planner/profiles/profile-document';
import {
  type IndustryActivityId,
  REACTION_ACTIVITY,
  type StructureBonus,
} from '@/features/industry-planner/structure-bonus';
import { hostsReactions, structureCategoryBonus } from '@/features/industry-planner/structure-factors';
import type { AvailableStructure } from '@/features/industry-planner/types';

// ---------------------------------------------------------------------------
// A profile's facilities as the page shows them: saved structures resolve to
// the account's current copy; a structure that has since gone stays listed so
// it can be removed. NPC stations carry no bonuses and run no reactions.

export interface FacilityView {
  key: string;
  facility: ProfileFacility;
  structure: AvailableStructure | null;
  systemId: number | null;
  missing: boolean;
  hostsReactions: boolean;
  hostsCapitals: boolean;
}

export function facilityViews(
  doc: ProfileDocument,
  structures: readonly AvailableStructure[] | null,
): FacilityView[] {
  return doc.facilities.map((facility) => {
    const structure = facility.kind === 'structure' ? (structures?.find((s) => s.id === facility.id) ?? null) : null;
    return {
      key: facilityKey(facility),
      facility,
      structure,
      systemId: structure === null ? facility.systemId : structure.systemId,
      missing: facility.kind === 'structure' && structures !== null && structure === null,
      hostsReactions: structure !== null && hostsReactions(structure.groupId),
      hostsCapitals: structure?.hostsCapitals === true,
    };
  });
}

const REACTION_KEYS: readonly CategoryKey[] = CATEGORY_GROUPS.filter((g) => g.activity === REACTION_ACTIVITY).flatMap(
  (g) => [g.key, ...g.leaves.map((l) => l.key)],
);

/**
 * What a facility cannot take: reactions anywhere but a refinery, and capital
 * ships anywhere without a capital shipyard. An NPC station takes neither.
 */
export function unavailableCategories(view: Pick<FacilityView, 'hostsReactions' | 'hostsCapitals'>): ReadonlySet<CategoryKey> {
  return new Set<CategoryKey>([
    ...(view.hostsReactions ? [] : REACTION_KEYS),
    ...(view.hostsCapitals ? [] : (['capital-ships'] as const)),
  ]);
}

/** A new facility covers whatever no other facility covers at the top level yet. */
function startingCategories(doc: ProfileDocument, reactions: boolean): CategoryKey[] {
  const covered = new Set(doc.facilities.flatMap((f) => f.categories));
  const roots: CategoryKey[] = reactions ? [ALL_MANUFACTURING, 'reactions'] : [ALL_MANUFACTURING];
  return roots.filter((root) => !covered.has(root));
}

export function structureFacility(
  doc: ProfileDocument,
  structure: Pick<AvailableStructure, 'id' | 'name' | 'systemId' | 'groupId'>,
): ProfileFacility {
  return {
    kind: 'structure',
    id: structure.id,
    name: structure.name,
    systemId: structure.systemId,
    categories: startingCategories(doc, hostsReactions(structure.groupId)),
  };
}

export function stationFacility(doc: ProfileDocument, station: StationSearchEntry): ProfileFacility {
  return {
    kind: 'station',
    id: String(station.id),
    name: station.name,
    systemId: station.systemId,
    categories: startingCategories(doc, false),
  };
}

// ---------------------------------------------------------------------------
// The add-facility list: saved structures show as soon as it opens; typing
// narrows them and searches NPC stations too. Facilities already on the
// profile are left out.

export type FacilityPick =
  | { kind: 'structure'; structure: AvailableStructure }
  | { kind: 'station'; station: StationSearchEntry };

export interface FacilityOption {
  value: string;
  label: string;
  pick: FacilityPick;
}

export interface FacilityOptionGroup {
  label: string;
  options: FacilityOption[];
}

const STATION_RESULTS = 8;

function nameMatches(name: string, query: string): boolean {
  const lower = name.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => lower.includes(word));
}

export function facilityOptionGroups(args: {
  query: string;
  structures: readonly AvailableStructure[];
  stations: readonly StationSearchEntry[];
  taken: ReadonlySet<string>;
}): FacilityOptionGroup[] {
  const query = args.query.trim();
  const structureOption = (structure: AvailableStructure): FacilityOption => ({
    value: `structure:${structure.id}`,
    label: structure.name,
    pick: { kind: 'structure', structure },
  });
  const open = args.structures.filter(
    (s) => !args.taken.has(`structure:${s.id}`) && (query === '' || nameMatches(s.name, query)),
  );
  const groups: FacilityOptionGroup[] = [
    { label: 'Corporation structures', options: open.filter((s) => s.source === 'corp').map(structureOption) },
    { label: 'Your structures', options: open.filter((s) => s.source === 'custom').map(structureOption) },
    {
      label: 'NPC stations',
      options: matchStations(
        args.stations.filter((s) => !args.taken.has(`station:${s.id}`)),
        query,
        STATION_RESULTS,
      ).map((station) => ({ value: `station:${station.id}`, label: station.name, pick: { kind: 'station', station } })),
    },
  ];
  return groups.filter((g) => g.options.length > 0);
}

// ---------------------------------------------------------------------------
// Where a structure's rigs reach: the categories it bonuses beyond what its
// hull gives every job.

function categoryScopes(): { key: CategoryKey; activity: IndustryActivityId; filterIds: number[] }[] {
  return CATEGORY_GROUPS.flatMap((group) => [
    ...(group.filterId === null ? [] : [{ key: group.key, activity: group.activity, filterIds: [group.filterId] }]),
    ...group.leaves.map((leaf) => ({
      key: leaf.key,
      activity: group.activity,
      filterIds: group.filterId === null ? [leaf.filterId] : [group.filterId, leaf.filterId],
    })),
  ]);
}

const beats = (bonus: StructureBonus, base: StructureBonus | null) =>
  bonus.me > (base?.me ?? 0) + 1e-9 || bonus.te > (base?.te ?? 0) + 1e-9;

export function rigBonuses(
  structure: AvailableStructure,
  security: number | null,
): Map<CategoryKey, StructureBonus> {
  const baseline = new Map<IndustryActivityId, StructureBonus | null>();
  const out = new Map<CategoryKey, StructureBonus>();
  for (const { key, activity, filterIds } of categoryScopes()) {
    if (!baseline.has(activity)) baseline.set(activity, structureCategoryBonus(structure, activity, security, []));
    const bonus = structureCategoryBonus(structure, activity, security, filterIds);
    if (bonus !== null && beats(bonus, baseline.get(activity) ?? null)) out.set(key, bonus);
  }
  return out;
}
