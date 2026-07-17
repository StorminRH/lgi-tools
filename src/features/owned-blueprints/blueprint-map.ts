// The owned-blueprint map (MIGRATE.0) — the per-type summary 3.7.5.2's
// per-component ME transform consumes. PURE (no I/O), so the consuming cached
// read (queries.ts) stays thin glue and the reduce is unit-tested here.
//
// One owner can hold several blueprints of the same type (a BPO plus researched
// BPCs at different ME). The map keeps the BEST copy per type — highest ME, then
// TE, then runs — since that is the copy a build would use, and counts how many
// are owned. The winning copy's owner + location ride along as a READOUT (3.7.5.5):
// they label "which blueprint, owned by whom, parked where" in the planner's orb
// popover, and are never read by the cost/ME compute path.
import type { OwnedBlueprintOwnerType } from './schema';

/** Original and copy blueprint quantities for one blueprint type. */
export interface OwnedBlueprintSummary {
  me: number;
  te: number;
  runs: number;
  owned: number;
  // The winning copy's owner + location (readout only). owner_id / location_id are
  // raw ids resolved to names server-side, above this pure reduce.
  ownerType: OwnedBlueprintOwnerType;
  ownerId: number;
  locationId: number;
  locationFlag: string;
}

/** Owned blueprint summaries indexed by blueprint type ID. */
export type OwnedBlueprintMap = Map<number, OwnedBlueprintSummary>;

/**
 * The columns the reduce needs from a stored row — a structural subset so callers
 * can pass the cached read's projection directly.
 */
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

// A BPO carries runs = -1 (infinite); a BPC carries its remaining count. For the
// "most runs" tiebreak a BPO is the best copy to surface (it's permanent and
// reusable), so its -1 ranks ABOVE any finite BPC count.
function runsRank(runs: number): number {
  return runs < 0 ? Number.POSITIVE_INFINITY : runs;
}

// Is `row` a better copy to surface than the summary already held? Highest ME
// wins, then highest TE, then most runs (a BPO beating any BPC) — the same
// precedence a builder picks. Owner/location are NOT part of the comparison: they
// are the chosen copy's provenance, not a selection criterion.
function isBetterCopy(row: BlueprintMapInput, summary: OwnedBlueprintSummary): boolean {
  if (row.materialEfficiency !== summary.me) return row.materialEfficiency > summary.me;
  if (row.timeEfficiency !== summary.te) return row.timeEfficiency > summary.te;
  return runsRank(row.runs) > runsRank(summary.runs);
}

/** Aggregates owned blueprint rows by type ID into original and copy quantities. */
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
