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
 * Rows per upsert statement. ~33k cost-index rows (systems × 6 activities) and
 * tens of thousands of adjusted-price rows blow past Postgres's 65535
 * bind-parameter ceiling in a single statement, so writes are chunked. 1000
 * keeps each statement well under the limit on either table's column count.
 */
export const UPSERT_CHUNK_SIZE = 1000;
