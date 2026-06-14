// API wire contract owned by the industry-planner feature (3.4.T).
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import type {
  BlueprintIndexEntry,
  BuildLocationData,
  IndustryStationView,
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
