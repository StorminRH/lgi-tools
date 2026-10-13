export const JITA_44_STATION_ID = 60003760;

export const NPC_STATION_ID_CEILING = 1e9;

export const REGIONAL_DISCOUNT_MIN_PCT = 15;
export const REGIONAL_DISCOUNT_MIN_UNITS = 10;

/** From this many due types the cron sweep reads the whole region dump instead; a page view never does. */
export const BULK_THRESHOLD = 100;

/** Region-dump pages in flight at once, after page 1 has said how many there are. */
export const PAGE_CONCURRENCY = 16;

/** Per-type order-book calls in flight at once; they share the market-order group's 12000 tokens a window. */
export const PER_TYPE_CONCURRENCY = 32;

/** Type ids one client may ask the refresh route for a minute, weighted by the ids in each request. */
export const ON_DEMAND_REFRESH_LIMIT_PER_MINUTE = 2000;

/** A safety ceiling on one request: a page asks for every due type in one request, not in groups. */
export const ON_DEMAND_REFRESH_MAX_TYPE_IDS = 2000;

export const DEPTH_BANDS_PCT = [0.5, 1, 2, 5, 10] as const;

export const BEST_DUST_VOLUME_DIVISOR = BigInt(1000);

export const BUY_SPREAD_FLOOR_RATIO = 0.35;

/**
 * The nightly backstop selects rows last fetched about a day ago, independently
 * of their five-minute viewing expiry. The lead accommodates daily run drift.
 */
export const BATCH_REFRESH_LEAD_MS = 3 * 60 * 60 * 1000;

export const BATCH_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
