// API wire contract owned by the skill-queue feature (MIGRATE.B.1). Runtime-light by
// design — zod plus the same-slice entry schema only, no server imports — so the
// client island and the route share one wire shape. The skills queue moved off the
// live Convex websocket onto a Neon stale-gated on-view read (src/db/skills-sync.ts);
// this is the GET the client fetches on view.
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import { skillQueueEntrySchema } from './esi-projection';

// ── GET /api/account/skills (authz: auth) ───────────────────────────────
// The signed-in user's per-character trained totals + training queue, read from Neon
// with a stale-gated on-view write-behind refresh, plus one shared skill-id→name map
// resolved server-side from the SDE. `data` is null until a character's first sync
// lands; `lastRefreshedAt` is the "as of" stamp (ms, bumped on every confirm incl a
// 304). Anonymous callers get an empty result. The client derives the live countdown
// from each entry's absolute finish_date — no value here ticks.
const characterSkillDataSchema = z.object({
  entries: z.array(skillQueueEntrySchema),
  totalSp: z.number(),
  unallocatedSp: z.number().optional(),
});

const viewerSkillsSchema = z.object({
  characterId: z.number(),
  data: characterSkillDataSchema.nullable(),
  lastRefreshedAt: z.number().nullable(),
});

const skillsResponseSchema = z.object({
  characters: z.array(viewerSkillsSchema),
  // skill type id (as a string key) → name, resolved server-side from the SDE.
  names: z.record(z.string(), z.string()),
});

/**
 * Character skill levels and queue data for the active character, with freshness metadata for
 * stale-gated reads.
 */
export type SkillsResponse = z.infer<typeof skillsResponseSchema>;

/**
 * Typed endpoint definition for skills endpoint; method, path, request, and response contracts
 * remain coupled here.
 */
export const skillsEndpoint: ApiEndpoint<null, SkillsResponse> = {
  method: 'GET',
  path: '/api/account/skills',
  request: null, // GET — no body
  response: skillsResponseSchema,
};
