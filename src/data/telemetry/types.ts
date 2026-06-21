// Actions a first-party CLIENT is allowed to POST to /api/telemetry — kept to
// the two the browser actually emits. The public route validates against this
// list (not the full set), so a client can't forge server-only rows (cron
// health signals, the auth/admin/feedback audit trail).
export const CLIENT_USAGE_ACTIONS = ['page_view', 'terminal_search'] as const;

// Server-only actions — written via logUsageEvent from route handlers/crons,
// never accepted from a client. The auth/admin/feedback audit trail plus the
// 3.0.10 observability health signals.
export const SERVER_USAGE_ACTIONS = [
  'auth_login',
  'auth_logout',
  'role_change',
  'character_switch', // active-character switch on the /characters page (3.4.2)
  'character_unlink', // a linked EVE character removed on the /characters page (3.4.2)
  'admin_character_unlink', // admin force-unlinked a character from any user
  'admin_force_logout', // admin revoked all of a user's sessions
  'admin_character_reassign', // admin moved a character onto their own account
  'feedback_submitted',
  'contact_submitted',
  // 3.0.10 observability:
  'price_source_degraded', // ESI→Fuzzwork degradation / budget exhaustion (O-1, S-2)
  'cron_prices', // hourly price-cron outcome — refreshed / skipped (O-2, O-3)
  'cron_industry_indices', // daily industry cost-index + adjusted-price cron outcome (3.5.1b)
  'cron_sde', // weekly SDE-cron outcome (O-2, O-3)
  'cron_gsc', // daily Google-Search-Console sync outcome — synced / skipped / failed (3.3.3)
  'cron_sync_sweeper', // 15-min sync-engine watchdog — dispatched>0 means the Convex scan lagged (3.4.9)
  'eve_token_refresh_race', // a vend hit invalid_grant on a token a concurrent vend had already rotated — the signal EVE has enabled invalidating refresh-token rotation (OOB-AUTH)
] as const;

// Closed enumeration of recognised actions. Extending: add to the client or
// server list above. No migration needed because the DB column is plain text.
export const USAGE_ACTIONS = [
  ...CLIENT_USAGE_ACTIONS,
  ...SERVER_USAGE_ACTIONS,
] as const;

export type UsageAction = (typeof USAGE_ACTIONS)[number];

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DailyCount {
  day: string;
  totalEvents: number;
  uniqueCharacters: number;
  anonymousEvents: number;
}

export interface PathCount {
  path: string;
  count: number;
}

export interface SearchCount {
  query: string;
  count: number;
}

export interface ReferrerCount {
  host: string;
  count: number;
}

export interface EntryPageCount {
  path: string;
  count: number;
}

export interface RoleChangeAuditEntry {
  timestamp: Date;
  actorCharacterId: number | null;
  actorName: string | null;
  targetCharacterId: number | null;
  targetName: string | null;
  from: string | null;
  to: string | null;
}

// ── Health dashboard aggregates (3.2.13) ────────────────────────────────
// All read-only rollups over the existing usage_logs cron/health rows plus
// the characters table. SQL emits raw numerators/denominators; ratios,
// bucketing, and edge-safe summary wording live in health-metrics.ts.

// ESI source health: ESI vs Fuzzwork-fallback row counts from `cron_prices`
// refreshed rows, with a per-day series for the trend chart.
export interface FallbackRateData {
  esi: number;
  fallback: number;
  perDay: { day: string; esi: number; fallback: number }[];
}

// One cron `outcome` value with its run count and average duration. Duration
// is averaged only over rows that recorded a numeric `durationMs`.
export interface CronOutcomeCount {
  outcome: string;
  count: number;
  avgDurationMs: number;
}

// Latest recorded run per cron action, regardless of the dashboard's selected
// range — the status strip's staleness anchor ("last run 2h ago").
export interface CronLastRun {
  action: UsageAction;
  timestamp: Date;
  outcome: string | null;
}

// Per-caller degradation-event counts. `caller` exists only on
// `price_source_degraded` rows (emitted only when degraded), so this counts
// degradation events by origin — there is no full-refresh denominator.
export interface DegradationCallerCount {
  caller: string;
  count: number;
}

// Per-day fetched/written totals from `cron_prices` refreshed rows.
export interface RefreshVolumePoint {
  day: string;
  fetched: number;
  written: number;
}

// Aggregate returning-vs-new user counts. Counts only — no identity surfaced.
export interface ReturningVsNew {
  newUsers: number;
  returning: number;
}

// Direct (no external referrer) vs referred page-view counts.
export interface SearchVsDirect {
  referred: number;
  direct: number;
}
