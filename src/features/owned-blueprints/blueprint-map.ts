import type { OwnedBlueprintOwnerType } from './schema';

export interface OwnedBlueprintSummary {
  me: number;
  te: number;
  runs: number;
  owned: number;
  ownerType: OwnedBlueprintOwnerType;
  ownerId: number;
  locationId: number;
  locationFlag: string;
}

export type OwnedBlueprintMap = Map<number, OwnedBlueprintSummary>;

export interface BlueprintMapInput {
  typeId: number;
  materialEfficiency: number;
  timeEfficiency: number;
  runs: number;
  ownerType: OwnedBlueprintOwnerType;
  ownerId: number;
  locationId: number;
  locationFlag: string;
}

function runsRank(runs: number): number {
  return runs < 0 ? Number.POSITIVE_INFINITY : runs;
}

function isBetterCopy(row: BlueprintMapInput, summary: OwnedBlueprintSummary): boolean {
  if (row.materialEfficiency !== summary.me) return row.materialEfficiency > summary.me;
  if (row.timeEfficiency !== summary.te) return row.timeEfficiency > summary.te;
  return runsRank(row.runs) > runsRank(summary.runs);
}

export function toOwnedBlueprintMap(rows: BlueprintMapInput[]): OwnedBlueprintMap {
  const map: OwnedBlueprintMap = new Map();
  for (const row of rows) {
    const existing = map.get(row.typeId);
    if (existing === undefined) {
      map.set(row.typeId, {
        me: row.materialEfficiency,
        te: row.timeEfficiency,
        runs: row.runs,
        owned: 1,
        ownerType: row.ownerType,
        ownerId: row.ownerId,
        locationId: row.locationId,
        locationFlag: row.locationFlag,
      });
      continue;
    }
    existing.owned += 1;
    if (isBetterCopy(row, existing)) {
      existing.me = row.materialEfficiency;
      existing.te = row.timeEfficiency;
      existing.runs = row.runs;
      existing.ownerType = row.ownerType;
      existing.ownerId = row.ownerId;
      existing.locationId = row.locationId;
      existing.locationFlag = row.locationFlag;
    }
  }
  return map;
}
