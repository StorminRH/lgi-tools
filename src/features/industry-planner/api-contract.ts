// API wire contract owned by the industry-planner feature (3.4.T).
import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import type { ApiEndpoint } from '@/lib/api-client';
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
  SystemSearchEntry,
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

// ── GET /api/industry/systems ───────────────────────────────────────────
// No user input; the route prerenders to a static JSON asset (the build-system
// search index). Mirrors SystemSearchEntry; filtered client-side.
export const systemSearchEntrySchema = z.object({
  id: z.number(),
  name: z.string(),
  security: z.number().nullable(),
}) satisfies z.ZodType<SystemSearchEntry>;

export const systemsResponseSchema = z.object({
  systems: z.array(systemSearchEntrySchema),
});
export type SystemsResponse = z.infer<typeof systemsResponseSchema>;

export const systemsEndpoint: ApiEndpoint<null, SystemsResponse> = {
  method: 'GET',
  path: '/api/industry/systems',
  request: null,
  response: systemsResponseSchema,
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

const availableStructureSchema = z.object({
  id: z.string(),
  source: z.enum(['custom', 'corp']),
  name: z.string(),
  structureTypeId: z.number(),
  role: z.enum(['manufacturing', 'reaction']),
  structureAttrs: attrMapSchema,
  rigAttrs: z.array(attrMapSchema),
  securityClass: z.enum(SECURITY_CLASSES).nullable(),
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
