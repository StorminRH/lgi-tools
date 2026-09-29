import type { CorpAssetEvidence, Placement } from '@/data/corp-holdings/placement';
import { type CorpGrant, visiblePlacements } from '@/platform/auth/corp-visibility';

export interface BlueprintRow {
  itemId?: number | null;
  typeId: number;
  materialEfficiency: number;
  timeEfficiency: number;
  runs: number;
  locationId: number;
  locationFlag: string;
}

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

export function visibleCorpBlueprintInputs(
  rows: readonly BlueprintRow[],
  grant: CorpGrant,
  evidence: CorpAssetEvidence | null = null,
): BlueprintMapInput[] {
  let matching = rows;
  let context = grant.context;
  if (grant.blueprints.kind !== 'all') {
    if (evidence === null || evidence.corporationId !== grant.corporationId) return [];
    const items = new Map(evidence.items.map((item) => [item.itemId, item]));
    matching = rows.filter((row) => {
      const item = row.itemId == null ? undefined : items.get(row.itemId);
      return item !== undefined && item.typeId === row.typeId &&
        item.locationId === row.locationId && item.locationFlag === row.locationFlag;
    });
    context = { ...context, index: evidence.index };
  }
  return visiblePlacements(matching, grant.blueprints, context).map(({ row, placement }) => ({
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
