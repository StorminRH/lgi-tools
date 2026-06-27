// The owned-blueprint map (MIGRATE.0) — the per-type summary 3.7.5.2's
// per-component ME transform consumes. PURE (no I/O), so the consuming cached
// read (queries.ts) stays thin glue and the reduce is unit-tested here.
//
// One owner can hold several blueprints of the same type (a BPO plus researched
// BPCs at different ME). The map keeps the BEST copy per type — highest ME, then
// TE, then runs — since that is the copy a build would use, and counts how many
// are owned.

export interface OwnedBlueprintSummary {
  me: number;
  te: number;
  runs: number;
  owned: number;
}

export type OwnedBlueprintMap = Map<number, OwnedBlueprintSummary>;

// The columns the reduce needs from a stored row — a structural subset so callers
// can pass the cached read's projection directly.
export interface BlueprintMapInput {
  typeId: number;
  materialEfficiency: number;
  timeEfficiency: number;
  runs: number;
}

// Is `row` a better copy to surface than the summary already held? Highest ME
// wins, then highest TE, then most runs — the same precedence a builder picks.
function isBetterCopy(row: BlueprintMapInput, summary: OwnedBlueprintSummary): boolean {
  if (row.materialEfficiency !== summary.me) return row.materialEfficiency > summary.me;
  if (row.timeEfficiency !== summary.te) return row.timeEfficiency > summary.te;
  return row.runs > summary.runs;
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
      });
      continue;
    }
    existing.owned += 1;
    if (isBetterCopy(row, existing)) {
      existing.me = row.materialEfficiency;
      existing.te = row.timeEfficiency;
      existing.runs = row.runs;
    }
  }
  return map;
}
