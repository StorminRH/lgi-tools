// Boundary schema + projection for the one ESI read the owned-structures store
// syncs (3.7.9): GET /corporations/{corporation_id}/structures/. ESI is an external
// API, so its body is Zod-validated here before anything is written to Neon; the
// projected shape is exactly what the corp_structures rows store. The endpoint
// returns more per-structure fields (services[], state, fuel_expires, reinforce
// hours, …); Zod strips the rest so a row carries only what the planner's location
// selector renders + what the bonus math needs (type + system, with the band derived
// at write).
//
// Wire shape verified against the swagger / Skoli ESI mirror, 2026-06-29. Keys stay
// snake_case — ESI's truth, parsed verbatim.
import { z } from 'zod';

/**
 * One element of the corp-structures list. `name` is authoritative (the corp owns
 * the structure) but kept optional so a single nameless structure never fails the
 * whole-body parse — it stores a null name and the selector falls back to the type.
 */
export const corpStructureSchema = z.object({
  structure_id: z.number().int(),
  type_id: z.number().int(),
  system_id: z.number().int(),
  name: z.string().optional(),
});
const corpStructuresBodySchema = z.array(corpStructureSchema);

export type ParsedCorpStructure = z.infer<typeof corpStructureSchema>;

/**
 * Returns null on a shape mismatch — the syncing layer keeps the stored catalogue
 * and retries on the next view rather than blanking it (a shape change won't fix
 * itself). Sorted by structure id for a stable order (ESI documents none).
 */
export function parseCorpStructuresBody(items: unknown[]): ParsedCorpStructure[] | null {
  const parsed = corpStructuresBodySchema.safeParse(items);
  if (!parsed.success) return null;
  return [...parsed.data].sort((a, b) => a.structure_id - b.structure_id);
}
