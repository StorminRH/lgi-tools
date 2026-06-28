// The owned-asset map (3.7.7.2) — the per-type summary the planner's asset ledger
// consumes (Owned / Remaining / held-by). PURE (no I/O), so the consuming cached
// read (queries.ts) stays thin glue and the reduce is unit-tested here. A mirror
// of the owned-blueprints blueprint-map.ts, with one deliberate divergence:
//
// Blueprints keep the BEST copy per type (ME/TE/runs differ per copy). Assets are
// FUNGIBLE — the projection already summed each (type, location) stack at write —
// so this reduce instead SUMS the owned quantity across every owner + location and
// keeps a `heldBy` LIST of each holding, the "where is my stock" the ledger shows.
// It also accepts an optional typeId filter: the cached read is FULL per-owner
// (one entry/owner, the high-hit-rate key), and the scope to the build's requested
// types is applied HERE, in the reduce.
import type { OwnedAssetOwnerType } from './schema';

// One (owner, location) holding of a type. quantity is the summed per-(type,
// location) stack the projection produced; this list keeps each distinct owner/
// location holding separate so the readout can show WHERE the units sit. owner_id
// / location_id are raw ids resolved to names server-side, above this pure reduce.
export interface AssetHolding {
  ownerType: OwnedAssetOwnerType;
  ownerId: number;
  locationId: number;
  locationFlag: string;
  locationType: string;
  quantity: number;
}

// Per-type summary: total owned across ALL owners + locations, plus the held-by
// list backing the popover.
export interface OwnedAssetSummary {
  ownedQty: number;
  heldBy: AssetHolding[];
}

export type OwnedAssetMap = Map<number, OwnedAssetSummary>;

// The columns the reduce needs from a stored row — a structural subset so callers
// can pass the cached read's projection directly.
export interface AssetMapInput {
  typeId: number;
  ownerType: OwnedAssetOwnerType;
  ownerId: number;
  locationId: number;
  locationFlag: string;
  locationType: string;
  quantity: number;
}

// Reduce stored rows → the per-type summary, optionally scoped to `typeIds` (the
// build's requested types; omit to keep every type). Rows arrive canonically
// sorted within an owner (the projection's compareAssets) and owners are flattened
// in a fixed order, so `heldBy` push-order is deterministic for a fixed owner set —
// no extra sort, matching the blueprint reduce's reliance on upstream ordering.
export function buildOwnedAssetMap(rows: AssetMapInput[], typeIds?: number[]): OwnedAssetMap {
  const wanted = typeIds ? new Set(typeIds) : null;
  const map: OwnedAssetMap = new Map();
  for (const row of rows) {
    if (wanted !== null && !wanted.has(row.typeId)) continue;
    let summary = map.get(row.typeId);
    if (summary === undefined) {
      summary = { ownedQty: 0, heldBy: [] };
      map.set(row.typeId, summary);
    }
    summary.ownedQty += row.quantity;
    summary.heldBy.push({
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      locationId: row.locationId,
      locationFlag: row.locationFlag,
      locationType: row.locationType,
      quantity: row.quantity,
    });
  }
  return map;
}
