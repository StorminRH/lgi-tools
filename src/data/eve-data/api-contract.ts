import { z } from 'zod';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';
import type { IngestSummary } from './ingest';
import type { ResolveSummary } from './tree-resolver';
import type { StationSearchEntry } from './stations-search';
import type { SystemSearchEntry } from './systems-search';
import type {
  AdjacencyAsset,
  SystemDirectoryAsset,
  WormholeCodexAsset,
  WormholeCodexEntry,
} from './universe-assets';
import {
  FAR_SIDE_WORMHOLE_CODE,
  WORMHOLE_EFFECTS,
  WORMHOLE_SIZE_CLASSES,
  WORMHOLE_TYPE_CODE,
} from './wormhole-contract';

export const ENTITY_NAMES_MAX_IDS = 200;
/** Per client IP. A page asks once per names hook, so this leaves room for busy pages while capping what an anonymous caller can make ESI resolve. */
export const ENTITY_NAMES_LIMIT_PER_MINUTE = 60;
export const TYPE_NAMES_MAX_IDS = 200;

export const typeNamesRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(TYPE_NAMES_MAX_IDS),
});

export const entityNamesRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(ENTITY_NAMES_MAX_IDS),
});

const entityNamesResponseSchema = z.object({
  names: z.record(z.string(), z.string()),
});
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

export const entityNamesEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/eve/names',
  request: entityNamesRequestSchema,
  responses: {
    200: jsonBody(entityNamesResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    429: problem('rate_limited'),
  },
});

export const typeNamesEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/eve/type-names',
  request: typeNamesRequestSchema,
  responses: {
    200: jsonBody(entityNamesResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

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

export const systemSearchEntrySchema = z.object({
  id: z.number(),
  name: z.string(),
  security: z.number().nullable(),
}) satisfies z.ZodType<SystemSearchEntry>;

const systemsResponseSchema = z.object({
  systems: z.array(systemSearchEntrySchema),
});
export const systemsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/industry/systems',
  request: null,
  responses: {
    200: jsonBody(systemsResponseSchema),
  },
});

const stationSearchEntrySchema = z.object({
  id: z.number(),
  name: z.string(),
  systemId: z.number(),
  security: z.number().nullable(),
}) satisfies z.ZodType<StationSearchEntry>;

export const stationsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/industry/stations',
  request: null,
  responses: {
    200: jsonBody(z.object({ stations: z.array(stationSearchEntrySchema) })),
  },
});

const universeAssetVersionSchema = z.string().min(1).max(64);

export const UNIVERSE_ASSET_CACHE_CONTROL =
  'public, max-age=31536000, immutable';

export const universeAssetVersionParamsSchema = z.object({
  version: universeAssetVersionSchema,
});

const universeAssetManifestResponseSchema = z.object({
  version: universeAssetVersionSchema,
});

const systemDirectoryEntrySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  regionName: z.string(),
  whClassId: z.number().int().nullable(),
  security: z.number().nullable(),
  effect: z.enum(WORMHOLE_EFFECTS).nullable(),
});

const systemDirectoryResponseSchema = z.object({
  version: universeAssetVersionSchema,
  systems: z.array(systemDirectoryEntrySchema),
}) satisfies z.ZodType<SystemDirectoryAsset>;

const adjacencyEntrySchema = z.tuple([
  z.number().int(),
  z.array(z.number().int()),
]);

const adjacencyResponseSchema = z.object({
  version: universeAssetVersionSchema,
  adjacency: z.array(adjacencyEntrySchema),
}) satisfies z.ZodType<AdjacencyAsset>;

const typedWormholeCodexEntrySchema = z.object({
  code: z.string().regex(WORMHOLE_TYPE_CODE),
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

const wormholeCodexEntrySchema = z.discriminatedUnion('farSide', [
  typedWormholeCodexEntrySchema,
  farSideWormholeCodexEntrySchema,
]) satisfies z.ZodType<WormholeCodexEntry>;

const wormholeEffectEntrySchema = z.object({
  effect: z.enum(WORMHOLE_EFFECTS),
  wormholeClass: z.number().int(),
  typeId: z.number().int().positive(),
  modifiers: z.array(z.object({
    attributeId: z.number().int(),
    label: z.string(),
    percent: z.number(),
  })),
});

const wormholeCodexResponseSchema = z.object({
  version: universeAssetVersionSchema,
  types: z.array(wormholeCodexEntrySchema),
  // Defaults so a codex from an older asset layout still parses; only the
  // effect lists go empty rather than the whole codex failing.
  effects: z.array(wormholeEffectEntrySchema).default([]),
}) satisfies z.ZodType<WormholeCodexAsset, unknown>;

export const universeAssetManifestEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/universe/assets',
  request: null,
  responses: {
    200: jsonBody(universeAssetManifestResponseSchema),
    503: problem('sde_unavailable'),
  },
});

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
