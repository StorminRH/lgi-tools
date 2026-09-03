import { bigint, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { IndustryJob } from './esi-projection';

/**
 * One row per character: the active job board, stored as jsonb verbatim — a small
 * ordered list always read and written as one unit. Each job carries its ABSOLUTE
 * end_date (and raw ESI status), so the client countdown derives "ready" from
 * end_date − now with no scheduler. A refresh REPLACES the row (upsert), so the
 * character id is the natural primary key. No foreign key on character_id: the same
 * FK-less provenance posture as the skills/owned-blueprints tables.
 */
export const characterIndustryJobs = pgTable('character_industry_jobs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
});

export const characterIndustryJobSyncs = pgTable('character_industry_job_syncs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  jobsEtag: text('jobs_etag'),
});

export const corpIndustryJobs = pgTable(
  'corp_industry_jobs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);

export const corpIndustryJobSyncs = pgTable(
  'corp_industry_job_syncs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
    jobsEtag: text('jobs_etag'),
    syncError: text('sync_error'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);
