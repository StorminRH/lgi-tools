// API wire contract owned by the industry-jobs feature (MIGRATE.B.2). Runtime-light by
// design — zod plus the same-slice job schema only, no server imports — so the client
// island and the route share one wire shape. The personal job board moved off the live
// Convex websocket onto a Neon stale-gated on-view read (src/db/industry-jobs-sync.ts);
// this is the GET the client fetches on view.
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import { industryJobSchema } from './esi-projection';

// ── GET /api/account/industry-jobs (authz: auth) ─────────────────────────
// The signed-in user's per-character active job boards, read from Neon with a
// stale-gated on-view write-behind refresh, plus one shared type-id→name map resolved
// server-side from the SDE (blueprint + product names). `data` is null until a
// character's first sync lands; `lastRefreshedAt` is the "as of" stamp (ms, bumped on
// every confirm incl a 304). Anonymous callers get an empty result. The client derives
// each job's live "ready" + countdown from its absolute end_date — no value here ticks,
// and there is no server-side completion flip.
const characterJobsDataSchema = z.object({
  jobs: z.array(industryJobSchema),
});

const viewerJobsSchema = z.object({
  characterId: z.number(),
  data: characterJobsDataSchema.nullable(),
  lastRefreshedAt: z.number().nullable(),
});

const jobsResponseSchema = z.object({
  characters: z.array(viewerJobsSchema),
  // type id (as a string key) → name, resolved server-side from the SDE.
  names: z.record(z.string(), z.string()),
});

/**
 * Stable industry jobs outcome returned across the owning boundary; callers handle the represented
 * success, absence, or failure states.
 */
export type JobsResponse = z.infer<typeof jobsResponseSchema>;

/**
 * Boundary validator for industry jobs endpoint; successful parsing yields the normalized industry
 * jobs input consumed internally.
 */
export const industryJobsEndpoint: ApiEndpoint<null, JobsResponse> = {
  method: 'GET',
  path: '/api/account/industry-jobs',
  request: null, // GET — no body
  response: jobsResponseSchema,
};

// ── GET /api/account/corp-industry-jobs (authz: auth) ────────────────────
// The signed-in user's per-corporation active job boards, read from Neon with a
// stale-gated on-view write-behind refresh (corp jobs moved off the live Convex engine
// in MIGRATE.B.3). `data` is null when the corp has no readable board yet (un-synced)
// or its `syncError` is `needs_role` (no linked member holds the in-game role —
// granting scope can't fix it). `lastRefreshedAt` is the "as of" stamp. The blueprint +
// product names ride the same response (server-resolved); the corp + installer names
// are resolved client-side via /api/eve/names. Anonymous callers get an empty result.
const viewerCorpJobsSchema = z.object({
  corporationId: z.number(),
  data: characterJobsDataSchema.nullable(),
  lastRefreshedAt: z.number().nullable(),
  syncError: z.string().nullable(),
});

const corpJobsResponseSchema = z.object({
  corporations: z.array(viewerCorpJobsSchema),
  names: z.record(z.string(), z.string()),
});

/**
 * Stable industry jobs outcome returned across the owning boundary; callers handle the represented
 * success, absence, or failure states.
 */
export type CorpJobsResponse = z.infer<typeof corpJobsResponseSchema>;

/**
 * Boundary validator for corp industry jobs endpoint; successful parsing yields the normalized
 * industry jobs input consumed internally.
 */
export const corpIndustryJobsEndpoint: ApiEndpoint<null, CorpJobsResponse> = {
  method: 'GET',
  path: '/api/account/corp-industry-jobs',
  request: null, // GET — no body
  response: corpJobsResponseSchema,
};

// ── GET /api/account/industry-slots (authz: auth) ─────────────────────────
// Per linked character, the industry slot CAPACITY per activity — computed
// server-side from the character's trained slot skills (1 base + Mass
// Production/Advanced Mass Production, Laboratory Operation/Advanced
// Laboratory Operation, Mass Reactions/Advanced Mass Reactions — see
// slots.ts), so the wire stays slot-language, not skill-language. `synced` is
// false when the character's skills have never synced: the slots are then the
// base 1/1/1 fail-open, and the client treats it as the cold write-behind
// signal (bounded reconcile re-fetches until it flips). Anonymous callers get
// an empty
// list. Used slots are NOT here — the client counts them from the job boards
// it already reads (personal + installer-attributed corp jobs).
const slotCapacitySchema = z.object({
  manufacturing: z.number().int(),
  science: z.number().int(),
  reactions: z.number().int(),
});

const viewerSlotsSchema = z.object({
  characterId: z.number(),
  slots: slotCapacitySchema,
  synced: z.boolean(),
});

const industrySlotsResponseSchema = z.object({
  characters: z.array(viewerSlotsSchema),
});

/** Personal and corporation industry-slot usage visible to the current viewer. */
export type ViewerSlots = z.infer<typeof viewerSlotsSchema>;
/**
 * Stable industry jobs outcome returned across the owning boundary; callers handle the represented
 * success, absence, or failure states.
 */
export type IndustrySlotsResponse = z.infer<typeof industrySlotsResponseSchema>;

/**
 * Typed endpoint definition for industry slots endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const industrySlotsEndpoint: ApiEndpoint<null, IndustrySlotsResponse> = {
  method: 'GET',
  path: '/api/account/industry-slots',
  request: null, // GET — no body
  response: industrySlotsResponseSchema,
};
