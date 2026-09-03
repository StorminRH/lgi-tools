import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { SkillQueueEntry } from './esi-projection';

export const characterSkills = pgTable('character_skills', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  totalSp: bigint('total_sp', { mode: 'number' }).notNull(),
  unallocatedSp: bigint('unallocated_sp', { mode: 'number' }),
  queue: jsonb('queue').$type<SkillQueueEntry[]>().notNull().default([]),
  skillLevels: jsonb('skill_levels').$type<Record<string, number>>(),
});

export const characterSkillSyncs = pgTable('character_skill_syncs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  queueEtag: text('queue_etag'),
  skillsEtag: text('skills_etag'),
});
