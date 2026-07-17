/**
 * Closed, canonically ordered set of esi refresh datasets; consumers derive validation, unions,
 * and iteration from this one list.
 */
export const ESI_REFRESH_DATASETS = [
  'skills',
  'character_industry_jobs',
  'corporation_industry_jobs',
  'owned_blueprints',
  'owned_assets',
] as const;

/**
 * Closed, canonically ordered set of esi refresh job statuses; consumers derive validation,
 * unions, and iteration from this one list.
 */
export const ESI_REFRESH_JOB_STATUSES = [
  'queued',
  'running',
  'deferred_for_budget',
  'succeeded',
  'failed_retryable',
  'failed_permanent',
  'dead_lettered',
] as const;

/**
 * Closed, canonically ordered set of esi refresh owner types; consumers derive validation, unions,
 * and iteration from this one list.
 */
export const ESI_REFRESH_OWNER_TYPES = ['character', 'corporation'] as const;

/**
 * Closed, canonically ordered set of live esi refresh job statuses; consumers derive validation,
 * unions, and iteration from this one list.
 */
export const LIVE_ESI_REFRESH_JOB_STATUSES = [
  'queued',
  'running',
  'deferred_for_budget',
  'failed_retryable',
] as const;

/**
 * Duration in whole days for esi refresh job retention; retention code treats the boundary as a
 * shared policy.
 */
export const ESI_REFRESH_JOB_RETENTION_DAYS = 7;
/**
 * Maximum records processed in one esi refresh job pass, bounding per-run work.
 */
export const ESI_REFRESH_JOB_BATCH_SIZE = 5;
/**
 * Maximum attempts allowed for esi refresh job before the job becomes terminal.
 */
export const ESI_REFRESH_JOB_MAX_ATTEMPTS = 5;
/**
 * Duration in milliseconds for esi refresh stale running; callers share this policy value instead
 * of inventing another window.
 */
export const ESI_REFRESH_STALE_RUNNING_MS = 10 * 60 * 1000;
/**
 * Retry delays in milliseconds, ordered by attempt number; attempts beyond the list reuse its
 * final delay.
 */
export const ESI_REFRESH_RETRY_DELAYS_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;

/** Reserved alongside the existing 8273619013–16 cron locks. */
export const ADVISORY_LOCK_ESI_REFRESH_QUEUE = BigInt(8273619017);
