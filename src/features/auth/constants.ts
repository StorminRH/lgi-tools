// Corp-access decisions are security audit records rather than product
// analytics. Keep them for more than twice the 180-day telemetry horizon, then
// prune them through the daily GSC housekeeping seam.
export const CORP_ACCESS_AUDIT_RETENTION_DAYS = 400;

// Better Auth's database-backed OAuth state expires after minutes, but an
// abandoned callback cannot delete its verification row. Keep a one-day
// post-expiry buffer, then clear it in the daily housekeeping sweep.
export const VERIFICATION_RETENTION_DAYS = 1;
