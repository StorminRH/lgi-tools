// System/audit history outlives the 180-day traffic-telemetry window. Four
// hundred days preserves a complete year plus a late-investigation buffer and
// matches the existing security-audit retention policy.
export const DOMAIN_EVENT_RETENTION_DAYS = 400;
