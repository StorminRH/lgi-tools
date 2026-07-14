export const ESI_REFRESH_DATASETS = [
  'skills',
  'character_industry_jobs',
  'corporation_industry_jobs',
  'owned_blueprints',
  'owned_assets',
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

export const LIVE_ESI_REFRESH_JOB_STATUSES = [
  'queued',
  'running',
  'deferred_for_budget',
  'failed_retryable',
] as const;

export const ESI_REFRESH_JOB_RETENTION_DAYS = 7;
export const ESI_REFRESH_JOB_BATCH_SIZE = 5;
export const ESI_REFRESH_JOB_MAX_ATTEMPTS = 5;
export const ESI_REFRESH_STALE_RUNNING_MS = 10 * 60 * 1000;
export const ESI_REFRESH_RETRY_DELAYS_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
] as const;

// Reserved alongside the existing 8273619013–16 cron locks.
export const ADVISORY_LOCK_ESI_REFRESH_QUEUE = BigInt(8273619017);
