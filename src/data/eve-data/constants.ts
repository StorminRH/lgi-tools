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
// Arbitrary project-unique bigint serializing the three SDE ingest paths
// above against each other. The only advisory lock in the app now that the
// prices refresh is lock-free — namespace by feature if a second lock ever
// lands.
export const ADVISORY_LOCK_SDE_INGEST = BigInt(8273619013);

// `eve_data_meta` keys. Plain k/v table — see schema.ts.
export const SDE_META_KEY_VERSION = 'sde_version';
export const SDE_META_KEY_TREE_HASH = 'tree_resolver_hash';

// Version token for the tree-resolver ALGORITHM, folded into the resolver
// hash. The hash is otherwise derived from SDE row data, so a change to the
// resolver's math (not the data) wouldn't invalidate it — the rebuild would
// be skipped and stale flat materials would persist. Bump this whenever the
// resolver's output for unchanged SDE data changes, so the next deploy/cron
// rebuilds. History: 'v1' = whole-run rounding; 'v2-marginal' = fractional
// (marginal) runs — 3.0.5.3.
export const TREE_RESOLVER_ALGO_VERSION = 'v2-marginal';

// Revalidation tag for cached blueprint *structure* reads (the Industry
// Planner's `'use cache'` tree + flat-materials view, and the blueprint search
// index). `cacheLife('max')` already drops these on deploy, which covers the
// deploy-time SDE ingest; the weekly drift cron re-ingests WITHOUT a deploy, so
// it busts this tag after re-running the tree resolver to keep warm structure
// reads honest. Lives in eve-data (not the feature) so the SDE pipeline — which
// is not governed by the feature/data import boundaries — can revalidate it
// without a data → feature edge.
export const BLUEPRINT_STRUCTURE_TAG = 'blueprint-structure';
