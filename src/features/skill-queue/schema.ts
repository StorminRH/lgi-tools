// Neon storage for the skill-queue tracker (MIGRATE.B.1) — the Neon-native home
// for per-character trained totals + the training queue, replacing the live Convex
// skills datasets (characterSync/characterSyncData). The skills + skillqueue ESI
// endpoints both cache 120s with no real-time peer fan-out, and the queue's
// completion is a pure timestamp flip derived client-side (progress.ts) — so by the
// placement-by-temperature rule (docs/CONVEX.md) skills is slow, per-character data:
// Neon + a stale-gated on-view refresh, not the live engine. Mirrors the
// owned-blueprints slow-data template, simplified to a CHARACTER-only owner axis
// (skills has no corporation variant — no owner_type enum, the character id is the
// natural key).
//
// Two tables, mirroring the Convex `*Sync` metadata + `*SyncData` payload split:
//   - character_skills      — one row per character: trained totals + the queue
//   - character_skill_syncs — one row per character: the staleness stamp + held etags
import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { SkillQueueEntry } from './esi-projection';

/**
 * One row per character: the trained-SP headline totals plus the training queue.
 * A refresh REPLACES the row (upsert), so the character id is the natural primary
 * key. The queue is stored as jsonb verbatim — a small ordered list always read and
 * written as one unit (no per-entry query need), carrying each entry's ABSOLUTE
 * finish_date so the client countdown derives progress from finish_date − now. No
 * foreign key on character_id: the same FK-less provenance posture as the
 * owned-blueprints owner column.
 */
export const characterSkills = pgTable('character_skills', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  totalSp: bigint('total_sp', { mode: 'number' }).notNull(),
  unallocatedSp: bigint('unallocated_sp', { mode: 'number' }),
  queue: jsonb('queue').$type<SkillQueueEntry[]>().notNull().default([]),
  // skill type id (string key, JSON-native) → active_skill_level, for the
  // planner's skills→time lever (3.7.19.1). Nullable: null means the row
  // predates the column (or its skills half hasn't re-fetched since) — readers
  // fail open to the no-skill baseline. Populated by the first fresh /skills
  // read after migration 0039's etag clear.
  skillLevels: jsonb('skill_levels').$type<Record<string, number>>(),
});

/**
 * Per-character sync state — separate from the data row so the staleness gate and
 * the 304 path can read/stamp freshness without touching the payload (mirrors the
 * owned-blueprints sync split). `last_refreshed_at` is the staleness gate the
 * on-view refresh reads; the two etags are replayed on the next refresh so an
 * unchanged character returns a 304 and skips the row rewrite (the gate's own ETag
 * cache is unauthenticated-only, so an authed reader holds them). Two named etag
 * columns because skills syncs TWO single-page endpoints (skillqueue + skills),
 * vs owned-blueprints' single paged `page_etags` array.
 */
export const characterSkillSyncs = pgTable('character_skill_syncs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  queueEtag: text('queue_etag'),
  skillsEtag: text('skills_etag'),
});
