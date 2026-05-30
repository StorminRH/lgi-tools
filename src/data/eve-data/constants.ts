// Shared constants for the eve-data slice.

// Industry activity IDs we walk. 1 = manufacturing, 11 = reactions.
// Invention (8), copying (5), and research (3, 4) are deliberately
// EXCLUDED:
//   - invention has a probability dimension we don't model
//   - copying/research don't produce a tradeable output type
// If a future contributor wants to add one of these, the resolver's
// leaf-detection and the tracked-types union both need updates. Don't
// just append to this set.
export const INDUSTRY_ACTIVITY_IDS = new Set<number>([1, 11]);

// Reference blueprints pinned by the tree-resolver test fixture. Their
// flat material totals are committed in
// `__fixtures__/blueprint-flat-materials.json` and any change to the
// resolver that breaks one of them fails CI. Also doubles as the
// "sample blueprint set" feeding the idempotency hash so a CCP patch
// touching any of them flips the hash.
export const REFERENCE_BLUEPRINT_TYPE_IDS = [691, 24699, 23758] as const;

// Postgres advisory-lock key for the SDE ingest path. Held by:
//   - /api/cron/refresh-sde when a drift triggers a re-ingest
//   - pnpm db:refresh-sde / :prod CLIs
//   - vercel-build's ingest-sde-if-empty.ts on the first deploy
// Distinct from market-prices's ADVISORY_LOCK_REFRESH_PRICES so an
// in-flight price cron and an in-flight SDE re-ingest don't serialize
// each other. One above the prices lock — namespace by feature if a
// third lock ever lands.
export const ADVISORY_LOCK_SDE_INGEST = BigInt(8273619013);

// `eve_data_meta` keys. Plain k/v table — see schema.ts.
export const SDE_META_KEY_VERSION = 'sde_version';
export const SDE_META_KEY_TREE_HASH = 'tree_resolver_hash';

// Revalidation tag for cached blueprint *structure* reads (the Industry
// Planner's `'use cache'` tree + flat-materials view, and the blueprint search
// index). `cacheLife('max')` already drops these on deploy, which covers the
// deploy-time SDE ingest; the weekly drift cron re-ingests WITHOUT a deploy, so
// it busts this tag after re-running the tree resolver to keep warm structure
// reads honest. Lives in eve-data (not the feature) so the SDE pipeline — which
// is not governed by the feature/data import boundaries — can revalidate it
// without a data → feature edge.
export const BLUEPRINT_STRUCTURE_TAG = 'blueprint-structure';
