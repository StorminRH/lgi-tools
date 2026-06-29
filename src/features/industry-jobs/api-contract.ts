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

export type JobsResponse = z.infer<typeof jobsResponseSchema>;

export const industryJobsEndpoint: ApiEndpoint<null, JobsResponse> = {
  method: 'GET',
  path: '/api/account/industry-jobs',
  request: null, // GET — no body
  response: jobsResponseSchema,
};
