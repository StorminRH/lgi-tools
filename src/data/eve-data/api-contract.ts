// API wire contract owned by the eve-data slice (3.4.T).
//
// The SDE cron's reingested arm embeds the composition pipeline summary, so
// this boundary owns that wire shape while the higher layer satisfies it.
// ./systems-search imports this module at runtime, not the reverse.
import { z } from 'zod';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';
import type { IngestSummary } from './ingest';
import type { ResolveSummary } from './tree-resolver';
import type { SystemSearchEntry } from './systems-search';
import type {
  AdjacencyAsset,
  SystemDirectoryAsset,
  WormholeCodexAsset,
  WormholeCodexEntry,
} from './universe-assets';
import {
  FAR_SIDE_WORMHOLE_CODE,
  WORMHOLE_SIZE_CLASSES,
  isWormholeTypeCode,
} from './wormhole-contract';

// ── POST /api/eve/names (authz: none — public ESI read) ─────────────────
// Bulk entity-id → name resolution for characters + corporations (3.7.3.4),
// resolved through the one ESI gate's /universe/names. The merged active-jobs
// board enriches the installer + corporation ids in a pilot's live Convex docs
// at view time — entity names are never mirrored into Convex. Capped to bound
// the cold-cache fan-out (a board's distinct installers + corps stay small).

/** Maximum distinct EVE entity IDs accepted by one request, bounding cold-cache fan-out. */
export const ENTITY_NAMES_MAX_IDS = 200;

/**
 * Boundary validator for entity names request schema; successful parsing yields the normalized eve
 * data input consumed internally.
 */
export const entityNamesRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(ENTITY_NAMES_MAX_IDS),
});

// Keys are stringified entity ids; ids that don't resolve are simply absent.
const entityNamesResponseSchema = z.object({
  names: z.record(z.string(), z.string()),
});
/** Resolved EVE entity names keyed by numeric ID; unresolved IDs are intentionally absent. */
export type EntityNamesResponse = z.infer<typeof entityNamesResponseSchema>;

/** Complete SDE pipeline outcome returned by the refresh cron after a reingest. */
export type SdePipelineSummary = {
  ingest: IngestSummary;
  resolve: ResolveSummary;
  seed: {
    tracked: number;
    missing: number;
    inserted: number;
  };
  stationNames: { resolved: number };
  durationMs: number;
};

/**
 * Typed endpoint definition for entity names endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const entityNamesEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/eve/names',
  request: entityNamesRequestSchema,
  responses: {
    200: jsonBody(entityNamesResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

/**
 * ── GET /api/cron/refresh-sde (authz: cron) ─────────────────────────────
 * No programmatic consumer (Vercel cron reads logs only) — arms pinned with
 * `satisfies` in the route. Version markers are CCP build-number strings.
 */
export type CronRefreshSdeResponse =
  | { status: 'up-to-date'; sdeVersion: string }
  | { status: 'remote-unreachable'; sdeVersion: string }
  | { status: 'busy'; message: string }
  | {
      status: 'reingested';
      sdeVersionBefore: string | null;
      sdeVersionAfter: string | null;
      summary: SdePipelineSummary;
      marketPrices: { total: number; priced: number };
    };

/**
 * ── GET /api/industry/systems (authz: none — public SDE read) ───────────
 * The universe system search index (3.7.13.2): every persistent solar system,
 * name-sorted. No user input; the route prerenders to a static JSON asset.
 * Mirrors SystemSearchEntry (the systems search source's index shape) —
 * matched client-side, never filtered on the server.
 */
export const systemSearchEntrySchema = z.object({
  id: z.number(),
  name: z.string(),
  security: z.number().nullable(),
}) satisfies z.ZodType<SystemSearchEntry>;

/**
 * Boundary validator for systems response schema; successful parsing yields the normalized eve
 * data input consumed internally.
 */
export const systemsResponseSchema = z.object({
  systems: z.array(systemSearchEntrySchema),
});
/** Solar-system search response containing normalized ID, name, security, and region fields. */
export type SystemsResponse = z.infer<typeof systemsResponseSchema>;

/**
 * Typed endpoint definition for systems endpoint; method, path, request, and response contracts
 * remain coupled here.
 */
export const systemsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/industry/systems',
  request: null,
  responses: {
    200: jsonBody(systemsResponseSchema),
  },
});

// ── GET /api/universe/assets[/[version]/…] (authz: public) ─────────────

const universeAssetVersionSchema = z.string().min(1).max(64);

/** Cache policy shared by successful immutable universe-asset responses. */
export const UNIVERSE_ASSET_CACHE_CONTROL =
  'public, max-age=31536000, immutable';

/** Path boundary shared by every immutable version-addressed universe asset. */
export const universeAssetVersionParamsSchema = z.object({
  version: universeAssetVersionSchema,
});

/** Current SDE build identifier used to address immutable universe assets. */
export const universeAssetManifestResponseSchema = z.object({
  version: universeAssetVersionSchema,
});

const systemDirectoryEntrySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  whClassId: z.number().int().nullable(),
  security: z.number().nullable(),
});

/** Versioned solar-system directory response. */
export const systemDirectoryResponseSchema = z.object({
  version: universeAssetVersionSchema,
  systems: z.array(systemDirectoryEntrySchema),
}) satisfies z.ZodType<SystemDirectoryAsset>;

const adjacencyEntrySchema = z.tuple([
  z.number().int(),
  z.array(z.number().int()),
]);

/** Versioned stargate-adjacency response. */
export const adjacencyResponseSchema = z.object({
  version: universeAssetVersionSchema,
  adjacency: z.array(adjacencyEntrySchema),
}) satisfies z.ZodType<AdjacencyAsset>;

const typedWormholeCodexEntrySchema = z.object({
  code: z.string().refine(
    (code) =>
      code !== FAR_SIDE_WORMHOLE_CODE && isWormholeTypeCode(code),
    'Invalid typed wormhole code',
  ),
  typeId: z.number().int().positive(),
  farSide: z.literal(false),
  totalMass: z.number(),
  maxJumpMass: z.number(),
  massRegen: z.number(),
  lifetimeMinutes: z.number(),
  sizeClass: z.enum(WORMHOLE_SIZE_CLASSES),
  targetClass: z.number(),
});

const farSideWormholeCodexEntrySchema = z.object({
  code: z.literal(FAR_SIDE_WORMHOLE_CODE),
  typeId: z.number().int().positive(),
  farSide: z.literal(true),
});

/** Boundary validator for every typed or far-side wormhole codex row. */
export const wormholeCodexEntrySchema = z.discriminatedUnion('farSide', [
  typedWormholeCodexEntrySchema,
  farSideWormholeCodexEntrySchema,
]) satisfies z.ZodType<WormholeCodexEntry>;

/** Versioned wormhole-type codex response. */
export const wormholeCodexResponseSchema = z.object({
  version: universeAssetVersionSchema,
  types: z.array(wormholeCodexEntrySchema),
}) satisfies z.ZodType<WormholeCodexAsset>;

/** Uncached discovery endpoint for the current immutable universe-asset version. */
export const universeAssetManifestEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/universe/assets',
  request: null,
  responses: {
    200: jsonBody(universeAssetManifestResponseSchema),
    503: problem('sde_unavailable'),
  },
});

/** Immutable version-addressed system-directory endpoint. */
export const systemDirectoryEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/universe/assets/[version]/systems',
  request: null,
  params: universeAssetVersionParamsSchema,
  responses: {
    200: jsonBody(systemDirectoryResponseSchema),
    404: problem('asset_version_not_found'),
  },
});

/** Immutable version-addressed stargate-adjacency endpoint. */
export const adjacencyEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/universe/assets/[version]/adjacency',
  request: null,
  params: universeAssetVersionParamsSchema,
  responses: {
    200: jsonBody(adjacencyResponseSchema),
    404: problem('asset_version_not_found'),
  },
});

/** Immutable version-addressed wormhole-type codex endpoint. */
export const wormholeCodexEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/universe/assets/[version]/wormholes',
  request: null,
  params: universeAssetVersionParamsSchema,
  responses: {
    200: jsonBody(wormholeCodexResponseSchema),
    404: problem('asset_version_not_found'),
  },
});
