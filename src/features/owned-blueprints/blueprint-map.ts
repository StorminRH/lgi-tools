import type { Placement } from '@/data/corp-holdings/placement';
import { type CorpGrant, visiblePlacements } from '@/platform/auth/corp-visibility';

/** One stored owned_blueprints row, without its owner. */
export interface BlueprintRow {
  typeId: number;
  materialEfficiency: number;
  timeEfficiency: number;
  runs: number;
  locationId: number;
  locationFlag: string;
}

/** Who holds a copy and where; a corp copy carries the placement the filter admitted it with. */
export type BlueprintHolder =
  | { ownerType: 'character'; ownerId: number; locationId: number; locationFlag: string }
  | { ownerType: 'corporation'; ownerId: number; placement: Placement };

export type BlueprintMapInput = BlueprintHolder & {
  typeId: number;
  materialEfficiency: number;
  timeEfficiency: number;
  runs: number;
};

export type OwnedBlueprintSummary = BlueprintHolder & {
  me: number;
  te: number;
  runs: number;
  owned: number;
};

export type OwnedBlueprintMap = Map<number, OwnedBlueprintSummary>;

export function characterBlueprintInputs(rows: readonly BlueprintRow[], characterId: number): BlueprintMapInput[] {
  return rows.map((row) => ({ ownerType: 'character', ownerId: characterId, ...row }));
}

/** Corp copies the grant cannot see never compete for the best copy, so the ME the planner prices with is one the viewer can use. */
export function visibleCorpBlueprintInputs(rows: readonly BlueprintRow[], grant: CorpGrant): BlueprintMapInput[] {
  return visiblePlacements(rows, grant.blueprints, grant.context).map(({ row, placement }) => ({
    ownerType: 'corporation',
    ownerId: grant.corporationId,
    placement,
    typeId: row.typeId,
    materialEfficiency: row.materialEfficiency,
    timeEfficiency: row.timeEfficiency,
    runs: row.runs,
  }));
}

function runsRank(runs: number): number {
  return runs < 0 ? Number.POSITIVE_INFINITY : runs;
}

function isBetterCopy(row: BlueprintMapInput, summary: OwnedBlueprintSummary): boolean {
  if (row.materialEfficiency !== summary.me) return row.materialEfficiency > summary.me;
  if (row.timeEfficiency !== summary.te) return row.timeEfficiency > summary.te;
  return runsRank(row.runs) > runsRank(summary.runs);
}

function holderOf(row: BlueprintMapInput): BlueprintHolder {
  if (row.ownerType === 'corporation') {
    return { ownerType: 'corporation', ownerId: row.ownerId, placement: row.placement };
  }
  return { ownerType: 'character', ownerId: row.ownerId, locationId: row.locationId, locationFlag: row.locationFlag };
}

function toSummary(row: BlueprintMapInput, owned: number): OwnedBlueprintSummary {
  return { ...holderOf(row), me: row.materialEfficiency, te: row.timeEfficiency, runs: row.runs, owned };
}

export function toOwnedBlueprintMap(rows: readonly BlueprintMapInput[]): OwnedBlueprintMap {
  const map: OwnedBlueprintMap = new Map();
  for (const row of rows) {
    const existing = map.get(row.typeId);
    if (existing === undefined) {
      map.set(row.typeId, toSummary(row, 1));
    } else if (isBetterCopy(row, existing)) {
      map.set(row.typeId, toSummary(row, existing.owned + 1));
    } else {
      existing.owned += 1;
    }
  }
  return map;
}
