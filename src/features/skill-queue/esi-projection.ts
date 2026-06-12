// Boundary schemas + projection for the two ESI reads the skill-queue tracker
// syncs (3.4.7). ESI is an external API, so its bodies are Zod-validated here
// before anything is written to Convex; the projected shapes are exactly what
// the `characterSync` doc stores. Runtime-light by design — zod only — because
// the Convex action (convex/skillsSync.ts) imports this module and runs on the
// default Convex runtime.
//
// Wire shapes verified against the live ESI OpenAPI spec
// (esi.evetech.net/meta/openapi.json) + the /dev/esi sandbox, 2026-06-11.
// Entry keys stay snake_case: they are ESI's truth, stored verbatim.
import { z } from 'zod';

// GET /characters/{id}/skillqueue — only queue_position, skill_id, and
// finished_level are required; the dates and SP fields are all absent when
// the queue is paused.
const skillQueueEntrySchema = z.object({
  skill_id: z.number().int(),
  queue_position: z.number().int(),
  finished_level: z.number().int(),
  start_date: z.string().optional(),
  finish_date: z.string().optional(),
  level_start_sp: z.number().int().optional(),
  level_end_sp: z.number().int().optional(),
  training_start_sp: z.number().int().optional(),
});
const skillQueueBodySchema = z.array(skillQueueEntrySchema);

export type SkillQueueEntry = z.infer<typeof skillQueueEntrySchema>;

// GET /characters/{id}/skills — the tracker stores only the headline totals;
// the per-skill array (hundreds of rows per character) has no consumer yet,
// so it is deliberately not mirrored into Convex.
const skillsBodySchema = z.object({
  total_sp: z.number(),
  unallocated_sp: z.number().optional(),
});

export interface SkillTotals {
  totalSp: number;
  unallocatedSp?: number;
}

// Both parsers return null on a shape mismatch — the syncing action records a
// contract error for that character rather than retrying (a shape change
// won't fix itself) or crashing the whole run.

export function parseSkillQueueBody(body: unknown): SkillQueueEntry[] | null {
  const parsed = skillQueueBodySchema.safeParse(body);
  if (!parsed.success) return null;
  // ESI documents no ordering guarantee; the queue renders by position.
  return [...parsed.data].sort((a, b) => a.queue_position - b.queue_position);
}

export function parseSkillsBody(body: unknown): SkillTotals | null {
  const parsed = skillsBodySchema.safeParse(body);
  if (!parsed.success) return null;
  const totals: SkillTotals = { totalSp: parsed.data.total_sp };
  if (parsed.data.unallocated_sp !== undefined) {
    totals.unallocatedSp = parsed.data.unallocated_sp;
  }
  return totals;
}
