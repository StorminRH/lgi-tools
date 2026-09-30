export const CORP_ACCESS_AUDIT_RETENTION_DAYS = 400;

/**
 * Better Auth's database-backed OAuth state expires after minutes, but an
 * abandoned callback cannot delete its verification row. Keep a one-day
 * post-expiry buffer, then clear it in the daily housekeeping sweep.
 */
export const VERIFICATION_RETENTION_DAYS = 1;

/**
 * Better Auth deletes an expired session only when its cookie comes back, so an
 * abandoned one would stay forever. Clear sessions a day past expiry.
 */
export const SESSION_RETENTION_DAYS = 1;
