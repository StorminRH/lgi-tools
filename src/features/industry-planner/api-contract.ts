// API wire contract owned by the industry-planner feature (3.4.T).
import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import type { ApiEndpoint } from '@/lib/api-client';
import { planSnapshotWireSchema } from './template-snapshot';
import type {
  AssetHolding,
  AvailableStructuresResponse,
  BlueprintIndexEntry,
  BuildLocationData,
  IndustryStationView,
  OwnedAssetEntry,
  OwnedAssetsResponse,
  OwnedBlueprintMeEntry,
  OwnedBlueprintsResponse,
} from './types';

// Postgres 32-bit `integer` ceiling — system/blueprint ids are int4 columns.
const PG_INT4_MAX = 2_147_483_647;

// ── GET /api/industry/blueprints ────────────────────────────────────────
// No user input; the route prerenders to a static JSON asset. Mirrors
// BlueprintIndexEntry — pinned with `satisfies` here and exact-equality
// pinned in the contract test.
export const blueprintIndexEntrySchema = z.object({
  blueprintTypeId: z.number(),
  productTypeId: z.number(),
  name: z.string(),
}) satisfies z.ZodType<BlueprintIndexEntry>;

export const blueprintsResponseSchema = z.object({
  blueprints: z.array(blueprintIndexEntrySchema),
});
export type BlueprintsResponse = z.infer<typeof blueprintsResponseSchema>;

export const blueprintsEndpoint: ApiEndpoint<null, BlueprintsResponse> = {
  method: 'GET',
  path: '/api/industry/blueprints',
  request: null,
  response: blueprintsResponseSchema,
};

// ── POST /api/industry/build-location ───────────────────────────────────
// Body: the picked system + the blueprint in view (for its EIV base set). POST,
// not GET-with-query, because apiFetch carries a body — same shape as
// POST /api/market-prices/refresh. Validated in the route handler.
export const buildLocationRequestSchema = z.object({
  systemId: z.number().int().positive().max(PG_INT4_MAX),
  blueprintId: z.number().int().positive().max(PG_INT4_MAX),
});

const industryStationViewSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  operationName: z.string(),
  manufacturingCapable: z.boolean(),
  researchCapable: z.boolean(),
}) satisfies z.ZodType<IndustryStationView>;

export const buildLocationResponseSchema = z.object({
  stations: z.array(industryStationViewSchema),
  costIndices: z.object({
    manufacturing: z.number().nullable(),
    reaction: z.number().nullable(),
  }),
  adjustedPrices: z.array(
    z.object({ typeId: z.number(), adjustedPrice: z.number() }),
  ),
}) satisfies z.ZodType<BuildLocationData>;
export type BuildLocationResponse = z.infer<typeof buildLocationResponseSchema>;

// 400 arms mirror the refresh endpoint's shape.
export type BuildLocationBadRequest =
  | { error: 'invalid_json' }
  | { error: 'invalid_request'; issues: unknown[] };

export const buildLocationEndpoint: ApiEndpoint<
  z.input<typeof buildLocationRequestSchema>,
  BuildLocationResponse
> = {
  method: 'POST',
  path: '/api/industry/build-location',
  request: buildLocationRequestSchema,
  response: buildLocationResponseSchema,
};

// ── POST /api/industry/owned-blueprints ─────────────────────────────────
// Body: the blueprint type ids present in the planned build (the top product's
// blueprint + every buildable component's blueprint). POST, not GET-with-query,
// because the id set is unbounded and apiFetch carries a body. The response is
// scoped to the caller's OWNED blueprints among those requested — auth-gated,
// the user id comes from the session, never the body. Validated in the handler.
export const ownedBlueprintsRequestSchema = z.object({
  blueprintTypeIds: z.array(z.number().int().positive().max(PG_INT4_MAX)).max(4096),
});

const ownedBlueprintMeEntrySchema = z.object({
  blueprintTypeId: z.number(),
  me: z.number(),
  te: z.number(),
  ownerType: z.enum(['character', 'corporation']),
  ownerName: z.string(),
  locationName: z.string(),
  locationFlag: z.string(),
}) satisfies z.ZodType<OwnedBlueprintMeEntry>;

export const ownedBlueprintsResponseSchema = z.object({
  blueprints: z.array(ownedBlueprintMeEntrySchema),
}) satisfies z.ZodType<OwnedBlueprintsResponse>;

// 400 arms mirror the build-location endpoint's shape.
export type OwnedBlueprintsBadRequest =
  | { error: 'invalid_json' }
  | { error: 'invalid_request'; issues: unknown[] };

export const ownedBlueprintsEndpoint: ApiEndpoint<
  z.input<typeof ownedBlueprintsRequestSchema>,
  OwnedBlueprintsResponse
> = {
  method: 'POST',
  path: '/api/industry/owned-blueprints',
  request: ownedBlueprintsRequestSchema,
  response: ownedBlueprintsResponseSchema,
};

// ── POST /api/industry/owned-assets ─────────────────────────────────────
// Body: the material/product type ids present in the planned build (every node's
// own type, raws + buildables + the top product). POST, not GET-with-query,
// because the id set is unbounded and apiFetch carries a body. The response is
// scoped to the caller's OWNED assets among those requested — auth-gated, the
// user id comes from the session, never the body. Validated in the handler.
export const ownedAssetsRequestSchema = z.object({
  typeIds: z.array(z.number().int().positive().max(PG_INT4_MAX)).max(4096),
});

const assetHoldingSchema = z.object({
  ownerType: z.enum(['character', 'corporation']),
  ownerName: z.string(),
  locationName: z.string(),
  locationFlag: z.string(),
  quantity: z.number(),
}) satisfies z.ZodType<AssetHolding>;

const ownedAssetEntrySchema = z.object({
  typeId: z.number(),
  ownedQty: z.number(),
  heldBy: z.array(assetHoldingSchema),
}) satisfies z.ZodType<OwnedAssetEntry>;

export const ownedAssetsResponseSchema = z.object({
  assets: z.array(ownedAssetEntrySchema),
}) satisfies z.ZodType<OwnedAssetsResponse>;

// 400 arms mirror the owned-blueprints endpoint's shape.
export type OwnedAssetsBadRequest =
  | { error: 'invalid_json' }
  | { error: 'invalid_request'; issues: unknown[] };

export const ownedAssetsEndpoint: ApiEndpoint<
  z.input<typeof ownedAssetsRequestSchema>,
  OwnedAssetsResponse
> = {
  method: 'POST',
  path: '/api/industry/owned-assets',
  request: ownedAssetsRequestSchema,
  response: ownedAssetsResponseSchema,
};

// ── POST /api/industry/skill-levels (authz: auth) ────────────────────────
// Body: the selected build character. POST, not GET-with-query, because
// apiFetch carries a body (the build-location precedent). The response is the
// character's trained ACTIVE skill levels from the skills tracker's Neon store
// — auth-gated: the user id comes from the session and the character must be
// one of the caller's linked characters. `levels: null` is EVERY fail-open arm
// (anonymous, not the caller's character, never synced, pre-column row) — the
// planner renders the no-skill baseline, never an error. Validated in the
// route handler.
export const skillLevelsRequestSchema = z.object({
  characterId: z.number().int().positive().max(PG_INT4_MAX),
});

export const skillLevelsResponseSchema = z.object({
  // skill type id (string key, JSON-native) → active_skill_level.
  levels: z.record(z.string(), z.number()).nullable(),
});
export type SkillLevelsResponse = z.infer<typeof skillLevelsResponseSchema>;

// 400 arms mirror the build-location endpoint's shape.
export type SkillLevelsBadRequest =
  | { error: 'invalid_json' }
  | { error: 'invalid_request'; issues: unknown[] };

export const skillLevelsEndpoint: ApiEndpoint<
  z.input<typeof skillLevelsRequestSchema>,
  SkillLevelsResponse
> = {
  method: 'POST',
  path: '/api/industry/skill-levels',
  request: skillLevelsRequestSchema,
  response: skillLevelsResponseSchema,
};

// ── GET /api/account/structures (authz: auth) ────────────────────────────
// The structures the signed-in caller can place a build in — their custom
// structures now (3.7.9.1.3), plus their corp's pulled structures next session
// (3.7.9.1.4), merged server-side with no selector change. Each carries its
// resolved structure + rig dogma so the bonus recomputes client-side, live.
// Anonymous callers get an empty list.
//
// `AttrMap` is number-keyed in TS but serializes with string JSON keys, so the
// runtime schema validates a string-keyed record; the endpoint's response type is
// pinned to the number-keyed wire interface (the one place the SDE dogma's
// number keys meet the wire's string keys).
const attrMapSchema = z.record(z.string(), z.number());

// Exported so api-contract.test.ts can pin its `groupId` field (the whole shape
// can't be `satisfies`/`toEqualTypeOf`-pinned because attrMapSchema infers string
// keys while AttrMap is number-keyed — see the response cast below).
export const availableStructureSchema = z.object({
  id: z.string(),
  source: z.enum(['custom', 'corp']),
  name: z.string(),
  structureTypeId: z.number(),
  groupId: z.number(),
  systemId: z.number().nullable(),
  structureAttrs: attrMapSchema,
  rigAttrs: z.array(attrMapSchema),
  securityClass: z.enum(SECURITY_CLASSES).nullable(),
  taxPct: z.number().nullable(),
});

export const availableStructuresResponseSchema = z.object({
  structures: z.array(availableStructureSchema),
});

// Surfaced from the contract module (alongside the schema) so the route imports
// its response shape from here — the api-contract is the one wire-shape home.
export type { AvailableStructure, AvailableStructuresResponse } from './types';

export const availableStructuresEndpoint: ApiEndpoint<null, AvailableStructuresResponse> = {
  method: 'GET',
  path: '/api/account/structures',
  request: null,
  response: availableStructuresResponseSchema as unknown as z.ZodType<AvailableStructuresResponse>,
};

// ── Saved build templates (3.7.23.1) ──────────────────────────────────────
// A named, versioned snapshot of the planner's complete configuration (inputs
// only — see template-snapshot.ts). Mutating endpoints echo the caller's full
// updated list (the custom-structures posture) so the client re-renders
// without a refetch; the GET feeds the planner and follows the fail-open read
// posture (anonymous ⇒ a typed empty list, never an error).

export const MAX_SAVED_PLAN_NAME_LEN = 80;
export const MAX_SAVED_PLANS_PER_USER = 50;
// A generous ceiling for one serialized snapshot — inputs only; a fully
// configured plan today is well under 2 KB.
export const MAX_SAVED_PLAN_SNAPSHOT_BYTES = 16_384;

const savedPlanId = z.string().min(1).max(100);
const savedPlanName = z.string().trim().min(1).max(MAX_SAVED_PLAN_NAME_LEN);

const savedPlanRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  favorite: z.boolean(),
  blueprintTypeId: z.number(),
  productTypeId: z.number(),
  productName: z.string(),
  snapshot: planSnapshotWireSchema,
  // ISO timestamp — drives the list's favorite-first / recently-updated order.
  updatedAt: z.string(),
});
export type SavedPlanRow = z.infer<typeof savedPlanRowSchema>;

export const savedPlansResponseSchema = z.object({
  plans: z.array(savedPlanRowSchema),
});
export type SavedPlansResponse = z.infer<typeof savedPlansResponseSchema>;

// ── GET /api/account/saved-plans ──────────────────────────────────────────
// No request body; the response is savedPlansResponseSchema above.
export const savedPlansEndpoint: ApiEndpoint<null, SavedPlansResponse> = {
  method: 'GET',
  path: '/api/account/saved-plans',
  request: null,
  response: savedPlansResponseSchema,
};

// ── POST /api/account/saved-plans ─────────────────────────────────────────
// Save the current configuration under a name. The snapshot is validated
// SHALLOWLY here (version tag + blueprint anchor + byte cap — see
// template-snapshot.ts for why deep validation waits until load); the route
// confirms the blueprint resolves and enforces the per-user cap.
export const createSavedPlanRequestSchema = z.object({
  name: savedPlanName,
  snapshot: planSnapshotWireSchema.refine(
    (snap) => JSON.stringify(snap).length <= MAX_SAVED_PLAN_SNAPSHOT_BYTES,
    'snapshot too large',
  ),
});
export type CreateSavedPlanRequest = z.input<typeof createSavedPlanRequestSchema>;

export const createSavedPlanEndpoint: ApiEndpoint<
  CreateSavedPlanRequest,
  SavedPlansResponse
> = {
  method: 'POST',
  path: '/api/account/saved-plans',
  request: createSavedPlanRequestSchema,
  response: savedPlansResponseSchema,
};

// ── POST /api/account/saved-plans/rename ──────────────────────────────────
export const renameSavedPlanRequestSchema = z.object({
  id: savedPlanId,
  name: savedPlanName,
});
export type RenameSavedPlanRequest = z.input<typeof renameSavedPlanRequestSchema>;

export const renameSavedPlanEndpoint: ApiEndpoint<
  RenameSavedPlanRequest,
  SavedPlansResponse
> = {
  method: 'POST',
  path: '/api/account/saved-plans/rename',
  request: renameSavedPlanRequestSchema,
  response: savedPlansResponseSchema,
};

// ── POST /api/account/saved-plans/favorite ────────────────────────────────
export const favoriteSavedPlanRequestSchema = z.object({
  id: savedPlanId,
  favorite: z.boolean(),
});
export type FavoriteSavedPlanRequest = z.input<typeof favoriteSavedPlanRequestSchema>;

export const favoriteSavedPlanEndpoint: ApiEndpoint<
  FavoriteSavedPlanRequest,
  SavedPlansResponse
> = {
  method: 'POST',
  path: '/api/account/saved-plans/favorite',
  request: favoriteSavedPlanRequestSchema,
  response: savedPlansResponseSchema,
};

// ── POST /api/account/saved-plans/delete ──────────────────────────────────
export const deleteSavedPlanRequestSchema = z.object({
  id: savedPlanId,
});
export type DeleteSavedPlanRequest = z.input<typeof deleteSavedPlanRequestSchema>;

export const deleteSavedPlanEndpoint: ApiEndpoint<
  DeleteSavedPlanRequest,
  SavedPlansResponse
> = {
  method: 'POST',
  path: '/api/account/saved-plans/delete',
  request: deleteSavedPlanRequestSchema,
  response: savedPlansResponseSchema,
};
