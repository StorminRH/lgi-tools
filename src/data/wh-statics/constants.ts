/**
 * Closed, canonically ordered set of wormhole-statics snapshot statuses; schema,
 * queries, and the review screen derive validation and unions from this one list.
 */
export const WH_STATICS_SNAPSHOT_STATUSES = [
  'pending',
  'promoted',
  'rejected',
  'superseded',
] as const;

/**
 * Advisory-lock id for the weekly wh-statics refresh cron and the matching
 * on-demand admin refresh. Distinct from the SDE (…013), industry-indices
 * (…014), GSC (…015), and subsequent reserved keys through …017.
 */
export const ADVISORY_LOCK_WH_STATICS = BigInt(8273619018);

/** Conditional-GET endpoint for the anoik.is per-system statics feed. */
export const WH_STATICS_FEED_URL = 'https://anoik.is/static/static.json';

/**
 * Retained snapshot history window. Pending rows and the currently promoted
 * snapshot are always preserved; older promoted, rejected, and superseded rows
 * are pruned by the daily GSC housekeeping bus.
 */
export const WH_STATICS_SNAPSHOT_RETENTION_DAYS = 90;

/** Cache tag invalidated after an operator promotes a pending snapshot. */
export const WH_STATICS_TAG = 'wh-statics';

/** Outbound timeout for the anoik.is conditional GET. */
export const WH_STATICS_FETCH_TIMEOUT_MS = 10_000;
