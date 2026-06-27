// API wire contract owned by the eve-data slice (3.4.T).
//
// Type-only import from the composition layer: the SDE cron's reingested arm
// embeds the pipeline summary that src/db/sde-pipeline.ts (the layer above
// this slice) assembles. `import type` is erased at compile time, so this
// creates no runtime edge or cycle.
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import type { SdePipelineSummary } from '@/db/sde-pipeline';

// ── POST /api/types/names (authz: none — public SDE read) ───────────────
// Bulk type-id → name resolution (3.4.7). The skill-queue island enriches the
// skill ids in a pilot's Convex docs from the Neon SDE at render time — SDE
// data is never mirrored into Convex. Capped well above the worst case (a
// 150-entry queue per character) but low enough to bound one query.

export const TYPE_NAMES_MAX_IDS = 300;

export const typeNamesRequestSchema = z.object({
  typeIds: z.array(z.number().int().positive()).min(1).max(TYPE_NAMES_MAX_IDS),
});

// Keys are stringified type ids (JSON objects have string keys); ids the SDE
// doesn't know are simply absent.
const typeNamesResponseSchema = z.object({
  names: z.record(z.string(), z.string()),
});
export type TypeNamesResponse = z.infer<typeof typeNamesResponseSchema>;

export const typeNamesEndpoint: ApiEndpoint<
  z.input<typeof typeNamesRequestSchema>,
  TypeNamesResponse
> = {
  method: 'POST',
  path: '/api/types/names',
  request: typeNamesRequestSchema,
  response: typeNamesResponseSchema,
};

// ── POST /api/eve/names (authz: none — public ESI read) ─────────────────
// Bulk entity-id → name resolution for characters + corporations (3.7.3.4),
// resolved through the one ESI gate's /universe/names. The merged active-jobs
// board enriches the installer + corporation ids in a pilot's live Convex docs
// at view time — entity names are never mirrored into Convex. Capped to bound
// the cold-cache fan-out (a board's distinct installers + corps stay small).

export const ENTITY_NAMES_MAX_IDS = 200;

export const entityNamesRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(ENTITY_NAMES_MAX_IDS),
});

// Keys are stringified entity ids; ids that don't resolve are simply absent.
const entityNamesResponseSchema = z.object({
  names: z.record(z.string(), z.string()),
});
export type EntityNamesResponse = z.infer<typeof entityNamesResponseSchema>;

export const entityNamesEndpoint: ApiEndpoint<
  z.input<typeof entityNamesRequestSchema>,
  EntityNamesResponse
> = {
  method: 'POST',
  path: '/api/eve/names',
  request: entityNamesRequestSchema,
  response: entityNamesResponseSchema,
};

// ── GET /api/cron/refresh-sde (authz: cron) ─────────────────────────────
// No programmatic consumer (Vercel cron reads logs only) — arms pinned with
// `satisfies` in the route. Version markers are CCP build-number strings.
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
