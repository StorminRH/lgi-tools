// API wire contract owned by the industry-planner feature (3.4.T).
import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';
import { planSnapshotWireSchema } from './template-snapshot';
import type {
  AssetHolding,
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

/**
 * ── GET /api/industry/blueprints ────────────────────────────────────────
 * No user input; the route prerenders to a static JSON asset. Mirrors
 * BlueprintIndexEntry — pinned with `satisfies` here and exact-equality
 * pinned in the contract test.
 */
export const blueprintIndexEntrySchema = z.object({
  blueprintTypeId: z.number(),
  productTypeId: z.number(),
  name: z.string(),
}) satisfies z.ZodType<BlueprintIndexEntry>;

/**
 * Boundary validator for blueprints response schema; successful parsing yields the normalized
 * industry planner input consumed internally.
 */
export const blueprintsResponseSchema = z.object({
  blueprints: z.array(blueprintIndexEntrySchema),
});
/**
 * Searchable blueprint index entries returned by the planner blueprint endpoint.
 */
export type BlueprintsResponse = z.infer<typeof blueprintsResponseSchema>;

/**
 * Typed endpoint definition for blueprints endpoint; method, path, request, and response contracts
 * remain coupled here.
 */
export const blueprintsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/industry/blueprints',
  request: null,
  responses: {
    200: jsonBody(blueprintsResponseSchema),
  },
});

/**
 * ── POST /api/industry/build-location ───────────────────────────────────
 * Body: the picked system + the blueprint in view (for its EIV base set). POST,
 * not GET-with-query, because apiFetch carries a body — same shape as
 * POST /api/market-prices/refresh. Validated in the route handler.
 */
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

/**
 * Boundary validator for build location response schema; successful parsing yields the normalized
 * industry planner input consumed internally.
 */
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
/**
 * Resolved build-location data for one system or structure selection, including the applicable
 * indices and facility modifiers.
 */
export type BuildLocationResponse = z.infer<typeof buildLocationResponseSchema>;

/**
 * Typed endpoint definition for build location endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const buildLocationEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/industry/build-location',
  request: buildLocationRequestSchema,
  responses: {
    200: jsonBody(buildLocationResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

/**
 * ── POST /api/industry/owned-blueprints ─────────────────────────────────
 * Body: the blueprint type ids present in the planned build (the top product's
 * blueprint + every buildable component's blueprint). POST, not GET-with-query,
 * because the id set is unbounded and apiFetch carries a body. The response is
 * scoped to the caller's OWNED blueprints among those requested — auth-gated,
 * the user id comes from the session, never the body. Validated in the handler.
 */
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

/**
 * Boundary validator for owned blueprints response schema; successful parsing yields the
 * normalized industry planner input consumed internally.
 */
export const ownedBlueprintsResponseSchema = z.object({
  blueprints: z.array(ownedBlueprintMeEntrySchema),
}) satisfies z.ZodType<OwnedBlueprintsResponse>;

/**
 * Typed endpoint definition for owned blueprints endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const ownedBlueprintsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/industry/owned-blueprints',
  request: ownedBlueprintsRequestSchema,
  responses: {
    200: jsonBody(ownedBlueprintsResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

/**
 * ── POST /api/industry/owned-assets ─────────────────────────────────────
 * Body: the material/product type ids present in the planned build (every node's
 * own type, raws + buildables + the top product). POST, not GET-with-query,
 * because the id set is unbounded and apiFetch carries a body. The response is
 * scoped to the caller's OWNED assets among those requested — auth-gated, the
 * user id comes from the session, never the body. Validated in the handler.
 */
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

/**
 * Boundary validator for owned assets response schema; successful parsing yields the normalized
 * industry planner input consumed internally.
 */
export const ownedAssetsResponseSchema = z.object({
  assets: z.array(ownedAssetEntrySchema),
}) satisfies z.ZodType<OwnedAssetsResponse>;

/**
 * Typed endpoint definition for owned assets endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const ownedAssetsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/industry/owned-assets',
  request: ownedAssetsRequestSchema,
  responses: {
    200: jsonBody(ownedAssetsResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

/**
 * ── POST /api/industry/skill-levels (authz: auth) ────────────────────────
 * Body: the selected build character. POST, not GET-with-query, because
 * apiFetch carries a body (the build-location precedent). The response is the
 * character's trained ACTIVE skill levels from the skills tracker's Neon store
 * — auth-gated: the user id comes from the session and the character must be
 * one of the caller's linked characters. `levels: null` is EVERY fail-open arm
 * (anonymous, not the caller's character, never synced, pre-column row) — the
 * planner renders the no-skill baseline, never an error. Validated in the
 * route handler.
 */
export const skillLevelsRequestSchema = z.object({
  characterId: z.number().int().positive().max(PG_INT4_MAX),
});

/**
 * Boundary validator for skill levels response schema; successful parsing yields the normalized
 * industry planner input consumed internally.
 */
export const skillLevelsResponseSchema = z.object({
  // skill type id (string key, JSON-native) → active_skill_level.
  levels: z.record(z.string(), z.number()).nullable(),
});
/**
 * Requested planner skill levels keyed by skill id; null means no authenticated character data is
 * available.
 */
export type SkillLevelsResponse = z.infer<typeof skillLevelsResponseSchema>;

/**
 * Typed endpoint definition for skill levels endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const skillLevelsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/industry/skill-levels',
  request: skillLevelsRequestSchema,
  responses: {
    200: jsonBody(skillLevelsResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

// ── GET /api/account/structures (authz: auth) ────────────────────────────
// The structures the signed-in caller can place a build in — their custom
// structures now (3.7.9.1.3), plus their corp's pulled structures next session
// (3.7.9.1.4), merged server-side with no selector change. Each carries its
// resolved structure + rig dogma so the bonus recomputes client-side, live.
// Anonymous callers get an empty list.
//
// `AttrMap` is number-keyed in the SDE domain but serializes with string JSON
// keys, so the wire contract is inferred from this string-keyed record.
const attrMapSchema = z.record(z.string(), z.number());

/**
 * Exported so api-contract.test.ts can pin its `groupId` field (the whole shape
 * can't be `satisfies`/`toEqualTypeOf`-pinned because attrMapSchema infers string
 * keys while AttrMap is number-keyed — see the response cast below).
 */
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

/**
 * Boundary validator for available structures response schema; successful parsing yields the
 * normalized industry planner input consumed internally.
 */
export const availableStructuresResponseSchema = z.object({
  structures: z.array(availableStructureSchema),
});

/** One custom or corporation structure available to the planner on the JSON wire. */
export type AvailableStructure = z.infer<typeof availableStructureSchema>;
/** Structures eligible for planner selection for the current caller. */
export type AvailableStructuresResponse = z.infer<typeof availableStructuresResponseSchema>;

/**
 * Typed endpoint definition for available structures endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const availableStructuresEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/structures',
  request: null,
  responses: {
    200: jsonBody(availableStructuresResponseSchema),
  },
});

// ── Saved build templates (3.7.23.1) ──────────────────────────────────────
// A named, versioned snapshot of the planner's complete configuration (inputs
// only — see template-snapshot.ts). Mutating endpoints echo the caller's full
// updated list (the custom-structures posture) so the client re-renders
// without a refetch; the GET feeds the planner and follows the fail-open read
// posture (anonymous ⇒ a typed empty list, never an error).

/** Maximum saved-plan name length in Unicode code units, shared by validation and the UI. */
export const MAX_SAVED_PLAN_NAME_LEN = 80;
/**
 * Inclusive upper bound for saved plans per user; validation and UI limits share this value.
 */
export const MAX_SAVED_PLANS_PER_USER = 50;
/**
 * A generous ceiling for one serialized snapshot — inputs only; a fully
 * configured plan today is well under 2 KB.
 */
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
/**
 * Display-ready saved plan row produced by industry planner; values retain their domain units and
 * require no additional query by the renderer.
 */
export type SavedPlanRow = z.infer<typeof savedPlanRowSchema>;

/**
 * Boundary validator for saved plans response schema; successful parsing yields the normalized
 * industry planner input consumed internally.
 */
export const savedPlansResponseSchema = z.object({
  plans: z.array(savedPlanRowSchema),
});
/**
 * Saved planner builds owned by the authenticated user, in stable server ordering for list and
 * tile views.
 */
export type SavedPlansResponse = z.infer<typeof savedPlansResponseSchema>;

/**
 * ── GET /api/account/saved-plans ──────────────────────────────────────────
 * No request body; the response is savedPlansResponseSchema above.
 */
export const savedPlansEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/saved-plans',
  request: null,
  responses: {
    200: jsonBody(savedPlansResponseSchema),
  },
});

/**
 * ── POST /api/account/saved-plans ─────────────────────────────────────────
 * Save the current configuration under a name. The snapshot is validated
 * SHALLOWLY here (version tag + blueprint anchor + byte cap — see
 * template-snapshot.ts for why deep validation waits until load); the route
 * confirms the blueprint resolves and enforces the per-user cap.
 */
export const createSavedPlanRequestSchema = z.object({
  name: savedPlanName,
  snapshot: planSnapshotWireSchema.refine(
    (snap) => JSON.stringify(snap).length <= MAX_SAVED_PLAN_SNAPSHOT_BYTES,
    'snapshot too large',
  ),
});
/**
 * Create payload containing the validated plan name and complete serializable planner snapshot.
 */
export type CreateSavedPlanRequest = z.input<typeof createSavedPlanRequestSchema>;

/**
 * Typed endpoint definition for create saved plan endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const createSavedPlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/saved-plans',
  request: createSavedPlanRequestSchema,
  responses: {
    201: jsonBody(savedPlansResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'unknown_blueprint'),
    401: problem('unauthenticated'),
    409: problem('template_limit'),
  },
});

/** ── POST /api/account/saved-plans/rename ────────────────────────────────── */
export const renameSavedPlanRequestSchema = z.object({
  id: savedPlanId,
  name: savedPlanName,
});
/**
 * Rename payload for one user-owned saved plan.
 */
export type RenameSavedPlanRequest = z.input<typeof renameSavedPlanRequestSchema>;

/**
 * Typed endpoint definition for rename saved plan endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const renameSavedPlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/saved-plans/rename',
  request: renameSavedPlanRequestSchema,
  responses: {
    200: jsonBody(savedPlansResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
  },
});

/** ── POST /api/account/saved-plans/favorite ──────────────────────────────── */
export const favoriteSavedPlanRequestSchema = z.object({
  id: savedPlanId,
  favorite: z.boolean(),
});
/**
 * Favorite-state mutation payload for one user-owned saved plan.
 */
export type FavoriteSavedPlanRequest = z.input<typeof favoriteSavedPlanRequestSchema>;

/**
 * Typed endpoint definition for favorite saved plan endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const favoriteSavedPlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/saved-plans/favorite',
  request: favoriteSavedPlanRequestSchema,
  responses: {
    200: jsonBody(savedPlansResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
  },
});

/** ── POST /api/account/saved-plans/delete ────────────────────────────────── */
export const deleteSavedPlanRequestSchema = z.object({
  id: savedPlanId,
});
/**
 * Delete payload identifying one user-owned saved plan.
 */
export type DeleteSavedPlanRequest = z.input<typeof deleteSavedPlanRequestSchema>;

/**
 * Typed endpoint definition for delete saved plan endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const deleteSavedPlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/saved-plans/delete',
  request: deleteSavedPlanRequestSchema,
  responses: {
    200: jsonBody(savedPlansResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
  },
});
