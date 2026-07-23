// API wire contract owned by the eve-data slice (3.4.T).
//
// The SDE cron's reingested arm embeds the composition pipeline summary, so
// this boundary owns that wire shape while the higher layer satisfies it.
// ./systems-search imports this module at runtime, not the reverse.
import { z } from 'zod';
import type { ApiEndpoint } from '@/transport/api-client';
import type { IngestSummary } from './ingest';
import type { ResolveSummary } from './tree-resolver';
import type { SystemSearchEntry } from './systems-search';

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
export const entityNamesEndpoint: ApiEndpoint<
  z.input<typeof entityNamesRequestSchema>,
  EntityNamesResponse
> = {
  method: 'POST',
  path: '/api/eve/names',
  request: entityNamesRequestSchema,
  response: entityNamesResponseSchema,
};

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
export const systemsEndpoint: ApiEndpoint<null, SystemsResponse> = {
  method: 'GET',
  path: '/api/industry/systems',
  request: null,
  response: systemsResponseSchema,
};
