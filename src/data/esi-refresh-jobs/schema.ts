import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  ESI_REFRESH_DATASETS,
  ESI_REFRESH_JOB_STATUSES,
  ESI_REFRESH_OWNER_TYPES,
} from './constants';

/**
 * Drizzle schema owner for esi refresh dataset enum; migrations, queries, retention, and purge
 * claims derive from this single declaration.
 */
export const esiRefreshDatasetEnum = pgEnum('esi_refresh_dataset', ESI_REFRESH_DATASETS);
/**
 * Drizzle schema owner for esi refresh job status enum; migrations, queries, retention, and purge
 * claims derive from this single declaration.
 */
export const esiRefreshJobStatusEnum = pgEnum(
  'esi_refresh_job_status',
  ESI_REFRESH_JOB_STATUSES,
);
/**
 * Drizzle schema owner for esi refresh owner type enum; migrations, queries, retention, and purge
 * claims derive from this single declaration.
 */
export const esiRefreshOwnerTypeEnum = pgEnum(
  'esi_refresh_owner_type',
  ESI_REFRESH_OWNER_TYPES,
);

/**
 * Drizzle schema owner for esi refresh jobs; migrations, queries, retention, and purge claims
 * derive from this single declaration.
 */
export const esiRefreshJobs = pgTable(
  'esi_refresh_jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    dataset: esiRefreshDatasetEnum('dataset').notNull(),
    userId: text('user_id').notNull(),
    ownerType: esiRefreshOwnerTypeEnum('owner_type').notNull(),
    ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
    resource: text('resource').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: esiRefreshJobStatusEnum('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    budgetReason: text('budget_reason'),
    budgetRemaining: integer('budget_remaining'),
    retryAfterSeconds: integer('retry_after_seconds'),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    uniqueIndex('esi_refresh_jobs_live_key_unique')
      .on(t.idempotencyKey)
      .where(
        sql`${t.status} in ('queued', 'running', 'deferred_for_budget', 'failed_retryable')`,
      ),
    index('esi_refresh_jobs_due_idx').on(t.status, t.nextAttemptAt, t.createdAt),
    index('esi_refresh_jobs_finished_idx').on(t.status, t.finishedAt),
    index('esi_refresh_jobs_user_idx').on(t.userId),
    index('esi_refresh_jobs_owner_idx').on(t.ownerType, t.ownerId),
  ],
);
