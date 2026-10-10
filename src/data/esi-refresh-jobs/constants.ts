export const ESI_REFRESH_DATASETS = [
  'skills',
  'character_industry_jobs',
  'corporation_industry_jobs',
  'owned_blueprints',
  'owned_assets',
  'character_sheet',
  'corp_context',
] as const;

export const ESI_REFRESH_JOB_STATUSES = [
  'queued',
  'running',
  'deferred_for_budget',
  'succeeded',
  'failed_retryable',
  'failed_permanent',
  'dead_lettered',
] as const;

export const ESI_REFRESH_OWNER_TYPES = ['character', 'corporation'] as const;

/**
 * Statuses that hold a job's idempotency key. The partial unique index
 * predicate renders this list in this order, and drizzle-kit compares that
 * text: reordering it would generate an index rebuild migration.
 */
export const LIVE_ESI_REFRESH_JOB_STATUSES = [
  'queued',
  'running',
  'deferred_for_budget',
  'failed_retryable',
] as const;

/** Live statuses a drain may move to running: every live status except running. */
export const CLAIMABLE_ESI_REFRESH_JOB_STATUSES = [
  'queued',
  'deferred_for_budget',
  'failed_retryable',
] as const satisfies readonly (typeof LIVE_ESI_REFRESH_JOB_STATUSES)[number][];

export const ESI_REFRESH_JOB_RETENTION_DAYS = 7;
/** Dead letters stay long enough for an operator to requeue them, then go. */
export const ESI_DEAD_LETTER_RETENTION_DAYS = 30;
export const ESI_REFRESH_JOB_BATCH_SIZE = 5;
export const ESI_REFRESH_JOB_MAX_ATTEMPTS = 5;
export const ESI_REFRESH_STALE_RUNNING_MS = 10 * 60 * 1000;
export const ESI_REFRESH_RETRY_DELAYS_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;
