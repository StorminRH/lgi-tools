export const INDUSTRY_ACTIVITIES = [
  'manufacturing',
  'researching_time_efficiency',
  'researching_material_efficiency',
  'copying',
  'invention',
  'reaction',
] as const;

export type IndustryActivity = (typeof INDUSTRY_ACTIVITIES)[number];

/**
 * Postgres advisory-lock key for this slice's daily refresh. Held only by
 * /api/cron/refresh-industry-indices, to skip an overlapping run of itself
 * (the upserts are idempotent, so this guards against a redundant double ESI
 * pull, not data integrity). Distinct project-unique bigint — must not collide
 * with ADVISORY_LOCK_SDE_INGEST (…013) or the removed prices lock (…012).
 */
export const ADVISORY_LOCK_INDUSTRY_INDICES = BigInt(8273619014);

/**
 * Rows per upsert statement. ~33k cost-index rows (systems × 6 activities) and
 * tens of thousands of adjusted-price rows blow past Postgres's 65535
 * bind-parameter ceiling in a single statement, so writes are chunked. 1000
 * keeps each statement well under the limit on either table's column count.
 */
export const UPSERT_CHUNK_SIZE = 1000;
