// Neon storage for the personal (per-character) industry-jobs tracker (MIGRATE.B.2)
// — the Neon-native home for each character's active job board, replacing the live
// Convex industry-jobs datasets (industryJobsSync/industryJobsSyncData). The
// industry-jobs ESI endpoint caches 300s with no real-time peer fan-out, and a job's
// "ready" is a pure timestamp flip derived client-side from each job's absolute
// end_date — so by the placement-by-temperature rule (docs/CONVEX.md) personal jobs
// is slow, per-character data: Neon + a stale-gated on-view refresh, not the live
// engine, and NO scheduled completion flip (the markReady scheduler is gone — the
// client countdown derives ready). Mirrors the skill-queue slice (MIGRATE.B.1),
// simplified further: jobs is ONE single-page endpoint, so one held etag (no
// two-halves split).
//
// Two tables, mirroring the Convex `*Sync` metadata + `*SyncData` payload split:
//   - character_industry_jobs      — one row per character: the job board (jsonb)
//   - character_industry_job_syncs — one row per character: the staleness stamp + etag
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

/**
 * Per-character sync state — separate from the data row so the staleness gate and
 * the 304 path read/stamp freshness without touching the payload. `last_refreshed_at`
 * is the staleness gate the on-view refresh reads; `jobs_etag` is replayed on the
 * next refresh so an unchanged board returns a 304 and skips the row rewrite (the
 * gate's own ETag cache is unauthenticated-only, so an authed reader holds it). ONE
 * etag column: industry jobs is a single, non-paged endpoint.
 */
export const characterIndustryJobSyncs = pgTable('character_industry_job_syncs', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  jobsEtag: text('jobs_etag'),
});

// ── CORP industry jobs (MIGRATE.B.3) — the corp twin of the two tables above ──
//
// The corp-jobs ESI endpoint caches 300s with no time-flip and its "ready" is the
// same client-derived timestamp flip, so by placement-by-temperature (docs/CONVEX.md)
// corp jobs is slow per-owner data: Neon + a stale-gated on-view refresh, replacing
// the live Convex corp-jobs tracker (corpIndustryJobsSync/corpIndustryJobsSyncData).
// Corp-token resolution moves to the membership/affiliation director pattern (NOT
// corpSync) — see corp-refresh.ts.
//
// Keyed by (user_id, corporation_id), NOT corp alone: a corp board is per-user and
// private here (the Convex tracker's policy, carried over verbatim — no cross-user
// sharing), and the role verdict is per-user (does THIS user have a role-holder?).
// Two members of the same corp each keep their own gated copy, exactly as the live
// tracker did.

/**
 * One row per (user, corp): the corp's active job board, jsonb verbatim. Each job
 * carries its raw ESI status + absolute end_date, so the client derives "ready" with
 * no scheduler. A refresh REPLACES the row (upsert), so (user_id, corporation_id) is
 * the natural composite key. No FK on either id (the FK-less provenance posture the
 * owned-blueprints/character-jobs tables share).
 */
export const corpIndustryJobs = pgTable(
  'corp_industry_jobs',
  {
    userId: text('user_id').notNull(),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    jobs: jsonb('jobs').$type<IndustryJob[]>().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.userId, t.corporationId] })],
);

/**
 * Per-(user, corp) sync state — separate from the board so the staleness gate and the
 * 304 path read/stamp freshness without touching the payload. `last_refreshed_at` is
 * the staleness gate; `jobs_etag` is the single held etag (one non-paged endpoint per
 * corp, same as the character read); `sync_error` carries the graceful per-corp state
 * the corp board surfaces — `needs_role` when no linked member holds the in-game
 * Factory Manager / Director role (granting more scope can't fix it). A successful
 * refresh / 304 clears it; a transient error leaves the row unstamped to retry.
 */
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
