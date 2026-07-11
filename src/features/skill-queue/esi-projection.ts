// Boundary schemas + projection for the two ESI reads the skill-queue tracker
// syncs (3.4.7; Neon-homed since MIGRATE.B.1). ESI is an external API, so its
// bodies are Zod-validated here before anything is persisted; the projected
// shapes are exactly what the character_skills row stores. Runtime-light by
// design — zod only.
//
// Wire shapes verified against the live ESI OpenAPI spec
// (esi.evetech.net/meta/openapi.json), 2026-06-11.
// Entry keys stay snake_case: they are ESI's truth, stored verbatim.
import { z } from 'zod';

// GET /characters/{id}/skillqueue — only queue_position, skill_id, and
// finished_level are required; the dates and SP fields are all absent when
// the queue is paused.
// Exported so the API contract (api-contract.ts) builds the wire response schema off
// the same entry shape the projection produces — one source of truth for an entry.
export const skillQueueEntrySchema = z.object({
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

// GET /characters/{id}/skills — headline totals plus the per-skill trained
// levels (3.7.19.1: the planner's skills→time lever is the array's first
// consumer). ACTIVE level, not trained: the game applies the alpha-capped
// active level to industry jobs, so the stored map is what actually holds
// in-game. The array is required in the ESI spec — its absence is a genuine
// contract mismatch, handled by the null path below.
const skillsBodySchema = z.object({
  total_sp: z.number(),
  unallocated_sp: z.number().optional(),
  skills: z.array(
    z.object({
      skill_id: z.number().int(),
      active_skill_level: z.number().int(),
    }),
  ),
});

export interface SkillTotals {
  totalSp: number;
  unallocatedSp?: number;
  // skill type id (string key — JSON-native) → active_skill_level.
  levels: Record<string, number>;
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
  const levels: Record<string, number> = {};
  for (const skill of parsed.data.skills) {
    levels[String(skill.skill_id)] = skill.active_skill_level;
  }
  const totals: SkillTotals = { totalSp: parsed.data.total_sp, levels };
  if (parsed.data.unallocated_sp !== undefined) {
    totals.unallocatedSp = parsed.data.unallocated_sp;
  }
  return totals;
}
