// Wire shapes verified against the live ESI OpenAPI spec

import { z } from 'zod';

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

// in-game. The array is required in the ESI spec — its absence is a genuine

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

  levels: Record<string, number>;
}

export function parseSkillQueueBody(body: unknown): SkillQueueEntry[] | null {
  const parsed = skillQueueBodySchema.safeParse(body);
  if (!parsed.success) return null;

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
