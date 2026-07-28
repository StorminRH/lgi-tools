// Shared constants for the wormhole-statics slice. Kept free of drizzle and
// fetch imports so read paths and registries can import retention, lock, and
// cache-tag values without dragging the feed client into unrelated graphs.

/**
 * Advisory-lock id for the weekly (and on-demand) wh-statics refresh. Distinct
 * from SDE (…013), industry-indices (…014), GSC (…015), affiliation (…016), and
 * ESI refresh queue (…017).
 */
export const ADVISORY_LOCK_WH_STATICS = BigInt(8273619018);

/** Canonical anoik.is statics payload URL used by the conditional GET. */
export const WH_STATICS_FEED_URL = 'https://anoik.is/static/static.json';

/**
 * Fail-fast bound for the anoik.is conditional GET. Matches the shared outbound
 * small-response default; the vendor registry records the same figure.
 */
export const WH_STATICS_FETCH_TIMEOUT_MS = 10_000;

/**
 * Retention window for non-pending snapshot rows. Pending rows and the currently
 * promoted snapshot are always preserved; the refresh-gsc housekeeping bus prunes
 * the rest.
 */
export const WH_STATICS_SNAPSHOT_RETENTION_DAYS = 90;

/**
 * Cache tag for the promoted `wh_system_statics` read path. Invalidated only after
 * a successful promote commits.
 */
export const WH_STATICS_TAG = 'wh-statics';

/**
 * Closed snapshot lifecycle vocabulary; schema, queries, and the admin surface
 * derive from this one list.
 */
export const WH_STATICS_SNAPSHOT_STATUSES = [
  'pending',
  'promoted',
  'rejected',
  'superseded',
] as const;

/** One snapshot lifecycle status. */
export type WhStaticsSnapshotStatus = (typeof WH_STATICS_SNAPSHOT_STATUSES)[number];
