// API wire contract owned by the owned-structures feature (3.7.9). Runtime-light by
// design — zod only, no server imports — so the route and (next session) the client
// island share one wire shape. The per-corp owned-structures catalogue moved onto a
// Neon stale-gated on-view read (src/db/corp-structures-sync.ts); this is the GET the
// planner's build-location selector will fetch on view.
import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
import type { ApiEndpoint } from '@/lib/api-client';

// ── GET /api/account/corp-structures (authz: auth) ───────────────────────
// The signed-in user's owned-structure catalogues, one per corporation they are a
// CURRENT member of, read from Neon with a stale-gated on-view write-behind refresh.
// The catalogue is shared per corp (every member reads the same rows); the read is
// scoped to the viewer's corp membership (the 3.7.3 corp-access gate). Each row
// carries the structure's id/type/system + its authoritative name (free from the corp
// endpoint) + the SDE-derived security band the bonus math reads. `lastRefreshedAt`
// is the "as of" stamp (ms), null until the corp's first sync lands. Anonymous callers
// get an empty list.
const corpStructureRowSchema = z.object({
  structureId: z.number(),
  typeId: z.number(),
  systemId: z.number(),
  securityClass: z.enum(SECURITY_CLASSES),
  name: z.string().nullable(),
});

const viewerCorpStructuresSchema = z.object({
  corporationId: z.number(),
  structures: z.array(corpStructureRowSchema),
  lastRefreshedAt: z.number().nullable(),
});

/**
 * Exported as the slice's canonical wire shape: the route derives its response type
 * from it (below), and next session's client adds the typed `apiFetch` endpoint that
 * validates against it (`response: corpStructuresResponseSchema`).
 */
export const corpStructuresResponseSchema = z.object({
  corporations: z.array(viewerCorpStructuresSchema),
});

export type CorpStructuresResponse = z.infer<typeof corpStructuresResponseSchema>;

/**
 * ── POST /api/account/corp-structures/sharing (authz: auth + Station_Manager) ──
 * Flip a corp's structure-sharing consent. The route is the trust boundary: the
 * caller must be a member of the corp AND hold the in-game Station_Manager role
 * (any of their linked pilots in it). ENABLE opts the corp in (the next member view
 * pulls the catalogue); DISABLE wipes the corp's stored structures, sync state, and
 * authored rigs. Echoes the new state so the toggle reflects it without a refetch.
 */
export const setCorpStructureSharingRequestSchema = z.object({
  corporationId: z.number().int().positive(),
  enabled: z.boolean(),
});
export type SetCorpStructureSharingRequest = z.input<typeof setCorpStructureSharingRequestSchema>;

export const corpStructureSharingResponseSchema = z.object({
  corporationId: z.number(),
  enabled: z.boolean(),
});
export type CorpStructureSharingResponse = z.infer<typeof corpStructureSharingResponseSchema>;

export const setCorpStructureSharingEndpoint: ApiEndpoint<
  SetCorpStructureSharingRequest,
  CorpStructureSharingResponse
> = {
  method: 'POST',
  path: '/api/account/corp-structures/sharing',
  request: setCorpStructureSharingRequestSchema,
  response: corpStructureSharingResponseSchema,
};

// ── POST /api/account/corp-structures/rigs (authz: auth + Station_Manager) ─────
// Record the authored completion for one corp structure: its fitted rigs and its
// owner-set facility tax (ESI exposes neither). Same member + Station_Manager gate
// as the sharing toggle. The structure/corp ids are EVE item ids (int8, not
// int4-bounded); rig type ids are int4 SDE type ids, capped at the 3 Upwell rig
// slots. An orphan structureId (not in the corp's pulled set) is harmless — it's
// never joined and is wiped on disable. Echoes the saved completion.
const PG_INT4_MAX = 2_147_483_647;
export const MAX_CORP_STRUCTURE_RIGS = 3;
export const setCorpStructureRigsRequestSchema = z.object({
  corporationId: z.number().int().positive(),
  structureId: z.number().int().positive(),
  rigTypeIds: z.array(z.number().int().positive().max(PG_INT4_MAX)).max(MAX_CORP_STRUCTURE_RIGS),
  // Facility tax percent, tri-state ON PURPOSE: undefined = leave the stored tax
  // unchanged (a rig-only save must not clobber it), null = clear (back to the
  // 0.25% NPC-baseline assumption), number = the entered rate (0–10%, decimals;
  // an entered 0 is a real 0%).
  taxPct: z.number().min(0).max(MAX_FACILITY_TAX_PCT).nullable().optional(),
});
export type SetCorpStructureRigsRequest = z.input<typeof setCorpStructureRigsRequestSchema>;

export const corpStructureRigsResponseSchema = z.object({
  structureId: z.number(),
  rigTypeIds: z.array(z.number()),
  taxPct: z.number().nullable(),
});
export type CorpStructureRigsResponse = z.infer<typeof corpStructureRigsResponseSchema>;

export const setCorpStructureRigsEndpoint: ApiEndpoint<
  SetCorpStructureRigsRequest,
  CorpStructureRigsResponse
> = {
  method: 'POST',
  path: '/api/account/corp-structures/rigs',
  request: setCorpStructureRigsRequestSchema,
  response: corpStructureRigsResponseSchema,
};
