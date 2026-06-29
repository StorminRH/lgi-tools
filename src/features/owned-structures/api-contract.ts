// API wire contract owned by the owned-structures feature (3.7.9). Runtime-light by
// design — zod only, no server imports — so the route and (next session) the client
// island share one wire shape. The per-corp owned-structures catalogue moved onto a
// Neon stale-gated on-view read (src/db/corp-structures-sync.ts); this is the GET the
// planner's build-location selector will fetch on view.
import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';

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

// Exported as the slice's canonical wire shape: the route derives its response type
// from it (below), and next session's client adds the typed `apiFetch` endpoint that
// validates against it (`response: corpStructuresResponseSchema`).
export const corpStructuresResponseSchema = z.object({
  corporations: z.array(viewerCorpStructuresSchema),
});

export type CorpStructuresResponse = z.infer<typeof corpStructuresResponseSchema>;
