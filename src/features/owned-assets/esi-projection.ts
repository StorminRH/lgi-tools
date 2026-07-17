// Boundary schema + projection for the owned-assets reads (3.7.7.1) — the
// character AND corporation asset endpoints (identical row shape). ESI is an
// external API, so its body is Zod-validated here before anything is written to
// Neon; the projected, AGGREGATED shape is exactly what the `owned_assets` rows
// store. Runtime-light by design — zod only.
//
// Wire shape verified against the live ESI OpenAPI spec
// (esi.evetech.net/meta/openapi.json), 2026-06-28: both
// GET /characters/{id}/assets and GET /corporations/{id}/assets return the same
// element shape, cached 3600s, paginated via ?page= + X-Pages.
//
// Unlike owned blueprints (where every copy is individually meaningful — ME/TE/
// runs differ per copy), assets of the same type at the same place are FUNGIBLE.
// So the projection AGGREGATES: it drops the per-item fields ESI returns that no
// consumer needs — `item_id` (the unique asset id), `is_singleton`, and
// `is_blueprint_copy` — and sums `quantity` per (type_id, location_id,
// location_flag, location_type). A hangar of 50 separate tritanium stacks
// becomes one row of the summed quantity. This bounds storage at the source and
// is exactly the per-(owner, location) quantity the held-by readout needs.
//
// Deliberate lossiness, consistent with dropping `is_blueprint_copy`: a BPC and
// a BPO of the same blueprint type at the same location collapse into one summed
// row. The asset ledger asks "how many units of this type are parked here", for
// which that is correct; if a later slice needs the BPC/BPO split it is a new
// column, not a structural rewrite.
import { z } from 'zod';

// One owned asset, ESI field names kept verbatim for the fields we store. The
// endpoint returns more — item_id / is_singleton / is_blueprint_copy — which the
// schema simply doesn't declare, so zod strips them.
//
//  - quantity: the stack size (a singleton reports 1). Summed during aggregation.
//  - location_id: a station, structure, solar system, or container item id —
//    disambiguated by location_type.
//  - location_flag: the sub-location (Hangar, CorpSAG1, Cargo, …).
//  - location_type: station | solar_system | item | other.
const ownedAssetSchema = z.object({
  // Type id, stack size, and location id are all positive EVE identifiers/counts — a
  // non-positive value would be a malformed boundary payload, so reject it here (a
  // failed parse skips the owner safely) rather than store a nonsense row.
  type_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
  location_id: z.number().int().positive(),
  // Both typed as large, CCP-extended enums — stored verbatim as strings so a new
  // flag or location type never fails the boundary parse.
  location_flag: z.string(),
  location_type: z.string(),
});
const ownedAssetsBodySchema = z.array(ownedAssetSchema);

export type OwnedAsset = z.infer<typeof ownedAssetSchema>;

// The aggregation key: same type at the same place (flag + type) is one holding.
function aggregateKey(asset: OwnedAsset): string {
  return `${asset.type_id}|${asset.location_id}|${asset.location_flag}|${asset.location_type}`;
}

// Sum quantity per (type_id, location_id, location_flag, location_type).
function aggregateAssets(assets: OwnedAsset[]): OwnedAsset[] {
  const byKey = new Map<string, OwnedAsset>();
  for (const asset of assets) {
    const existing = byKey.get(aggregateKey(asset));
    if (existing === undefined) {
      byKey.set(aggregateKey(asset), { ...asset });
    } else {
      existing.quantity += asset.quantity;
    }
  }
  return [...byKey.values()];
}

// Canonical ordering so the same owned set always projects to the same array
// regardless of ESI's (unspecified) ordering or the page it arrived on — the
// same stability the owned-blueprints projection relies on.
function compareAssets(a: OwnedAsset, b: OwnedAsset): number {
  return (
    a.type_id - b.type_id ||
    a.location_id - b.location_id ||
    (a.location_flag < b.location_flag ? -1 : a.location_flag > b.location_flag ? 1 : 0) ||
    (a.location_type < b.location_type ? -1 : a.location_type > b.location_type ? 1 : 0)
  );
}

/**
 * Returns null on a shape mismatch — the syncing path records a contract error
 * for that owner rather than retrying (a shape change won't fix itself) or
 * crashing the whole run. Mirrors parseBlueprintsBody.
 */
export function parseAssetsBody(body: unknown): OwnedAsset[] | null {
  const parsed = ownedAssetsBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return aggregateAssets(parsed.data).sort(compareAssets);
}
