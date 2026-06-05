// Per-IP ceiling for the public telemetry beacon. This fires on every
// navigation (one sendBeacon per page view), so the limit is deliberately
// generous — far higher than the contact (3) / feedback (5) / price-refresh
// (20) write routes — to bound a scripted flood that would skew the analytics
// the table feeds, without ever throttling a real visitor clicking around.
export const TELEMETRY_LIMIT_PER_MINUTE = 120;
