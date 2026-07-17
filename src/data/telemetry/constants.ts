/**
 * Per-IP ceiling for the public telemetry beacon. This fires on every
 * navigation (one sendBeacon per page view), so the limit is deliberately
 * generous — far higher than the contact (3) / feedback (5) / price-refresh
 * (20) write routes — to bound a scripted flood that would skew the analytics
 * the table feeds, without ever throttling a real visitor clicking around.
 */
export const TELEMETRY_LIMIT_PER_MINUTE = 120;

/**
 * Retention for the otherwise-unbounded usage_logs table — pruned daily by the
 * GSC cron. 180 days is 2× the widest admin read window (the 90-day traffic
 * horizon and the 90-day role-change audit), so nothing the dashboard shows is
 * ever pruned, while the table stays bounded and we don't hoard character-keyed
 * telemetry past what's used.
 */
export const USAGE_LOG_RETENTION_DAYS = 180;
