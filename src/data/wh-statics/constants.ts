/** Community feed endpoint for per-system wormhole statics. */
export const WH_STATICS_FEED_URL = 'https://anoik.is/static.json';

/** Maximum time allowed for the small community feed request. */
export const WH_STATICS_FETCH_TIMEOUT_MS = 10_000;

/** Retention window for reviewed and superseded statics snapshots. */
export const WH_STATICS_SNAPSHOT_RETENTION_DAYS = 90;

/** Cache tag invalidated after a statics snapshot is promoted. */
export const WH_STATICS_TAG = 'wh-statics';
