// Boundary schema + projection for the owned-blueprints reads the 3.7.5.1
// dataset syncs (the character AND corporation blueprint endpoints — identical
// row shape). ESI is an external API, so its body is Zod-validated here before
// anything is written to Convex; the projected shape is exactly what the
// `*BlueprintsSyncData` cold doc stores. Runtime-light by design — zod only —
// because the Convex actions (convex/characterBlueprintsSync.ts,
// convex/corpBlueprintsSync.ts) import this module and run on the default
// Convex runtime.
//
// Wire shape verified against the live ESI OpenAPI spec
// (esi.evetech.net/latest/swagger.json), 2026-06-27: both
// GET /characters/{id}/blueprints/ and GET /corporations/{id}/blueprints/
// return the same element shape, cached 3600s, paginated via ?page= + X-Pages.
import { z } from 'zod';

// One owned blueprint, ESI field names kept verbatim. The endpoint returns one
// more field than we store — `item_id`, the unique asset id — which Zod strips:
// no current consumer needs it (per-component ME in 3.7.5.2 keys off type_id),
// and a minimal cold payload keeps the reactive read small. A later slice can
// add it without a structural rewrite.
//
//  - quantity: -1 = a blueprint ORIGINAL (BPO), -2 = a COPY (BPC); a positive
//    value is a stack of originals fresh from the market (no activity yet).
//  - runs: -1 on a BPO (infinite runs); a BPC carries its remaining run count.
//  - material_efficiency / time_efficiency: the per-blueprint ME/TE levels —
//    the headline the efficiency engine consumes.
const ownedBlueprintSchema = z.object({
  type_id: z.number().int(),
  material_efficiency: z.number().int(),
  time_efficiency: z.number().int(),
  runs: z.number().int(),
  quantity: z.number().int(),
  location_id: z.number().int(),
  // ESI types this as a large, CCP-extended enum (Hangar, CorpSAG1, …). Stored
  // verbatim as a string so a new location flag never fails the boundary parse.
  location_flag: z.string(),
});
const ownedBlueprintsBodySchema = z.array(ownedBlueprintSchema);

export type OwnedBlueprint = z.infer<typeof ownedBlueprintSchema>;

// Canonical ordering so the same owned set always projects to the same array
// regardless of ESI's (unspecified) ordering or the page it arrived on — this
// is what lets the apply's deep-equal cold-skip recognise an unchanged sync and
// leave the reactive cold doc untouched.
function compareBlueprints(a: OwnedBlueprint, b: OwnedBlueprint): number {
  return (
    a.type_id - b.type_id ||
    a.material_efficiency - b.material_efficiency ||
    a.time_efficiency - b.time_efficiency ||
    a.runs - b.runs ||
    a.quantity - b.quantity ||
    a.location_id - b.location_id ||
    (a.location_flag < b.location_flag ? -1 : a.location_flag > b.location_flag ? 1 : 0)
  );
}

/**
 * Returns null on a shape mismatch — the syncing action records a contract
 * error for that subject rather than retrying (a shape change won't fix itself)
 * or crashing the whole run. Mirrors parseIndustryJobsBody.
 */
export function parseBlueprintsBody(body: unknown): OwnedBlueprint[] | null {
  const parsed = ownedBlueprintsBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return [...parsed.data].sort(compareBlueprints);
}
