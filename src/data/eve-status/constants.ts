/**
 * ESI's public server-status endpoint. It defaults to the Tranquility
 * datasource, so no query string is needed — and being unauthenticated, it
 * rides the shared ESI gate as a plain public GET.
 */
export const ESI_STATUS_PATH = '/status/';

/**
 * Revalidation tag for the cached status snapshot. The short time-based
 * cacheLife drives the refresh; this tag is here only as an optional manual
 * bust hook (there is no cron for server status).
 */
export const EVE_STATUS_TAG = 'eve-status';
