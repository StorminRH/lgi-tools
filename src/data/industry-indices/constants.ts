// Shared constants for the industry-indices slice. Kept dependency-free (no
// drizzle/server imports) so the activity list + types can be pulled anywhere.

/**
 * The six industry-activity keys CCP publishes on GET /industry/systems/ (the
 * cost-index endpoint), verbatim. This is CCP's vocabulary, so the column that
 * stores it is plain `text` narrowed to the union below — the market_prices
 * `source` pattern — not a Postgres enum. One source of truth for both the Zod
 * boundary schema (z.enum) and the column-type narrow.
 *
 * NOTE: these are the cost-index strings, distinct from the SDE blueprint
 * activity keys in eve-data/constants.ts (e.g. `research_time` there vs
 * `researching_time_efficiency` here). The two slices speak different CCP
 * vocabularies for the same underlying activities and never share this list.
 */
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
