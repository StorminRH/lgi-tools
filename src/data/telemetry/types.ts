/**
 * Actions a first-party CLIENT is allowed to POST to /api/telemetry — kept to
 * the two the browser actually emits. The public route validates against this
 * list (not the full set), so a client can't forge server-only rows (cron
 * health signals, the auth/admin/feedback audit trail).
 */
export const CLIENT_USAGE_ACTIONS = ['page_view', 'terminal_search'] as const;

/**
 * Server-only actions — written via logUsageEvent from route handlers/crons,
 * never accepted from a client. The auth/admin/feedback audit trail plus the
 * 3.0.10 observability health signals.
 */
export const SERVER_USAGE_ACTIONS = [
  'auth_login',
  'auth_logout',
  'role_change',
  'character_switch', // active-character switch on the /characters page (3.4.2)
  'character_unlink', // a linked EVE character removed on the /characters page (3.4.2)
  'admin_character_unlink', // admin force-unlinked a character from any user
  'admin_force_logout', // admin revoked all of a user's sessions
  'admin_character_reassign', // admin moved a character onto their own account
  'admin_esi_job_requeued', // admin returned a dead-lettered ESI refresh job to the normal queue
  'feedback_submitted',
  'cross_origin_mutation', // log-only signal for a browser mutation from a foreign origin
  // 3.0.10 observability:
  'price_source_degraded', // ESI→Fuzzwork degradation / budget exhaustion (O-1, S-2)
  'market_price_refresh', // on-demand price refresh timing, volume, and source mix
  'market_price_write_behind', // on-demand price persistence outcome
  'market_history_refresh', // on-demand history timing and fresh/warm/stale mix
  'market_history_write_behind', // on-demand history persistence outcome
  'owned_data_read', // authenticated owned-data endpoint timing and result volume
  'planner_open_timing', // server-only planner structure/pricing/history/shell timing
  'neon_cold_start_retry', // recovered or exhausted Neon cold-start retry envelope
  'public_esi_budget_alert_claimed', // short-lived lease acquired before public budget alert delivery
  'public_esi_budget_alerted', // aggregation-path marker for a dispatched public exhaustion alert
  'cron_prices', // hourly price-cron outcome — refreshed / skipped (O-2, O-3)
  'cron_industry_indices', // daily industry cost-index + adjusted-price cron outcome (3.5.1b)
  'cron_sde', // daily SDE-cron outcome (O-2, O-3)
  'cron_gsc', // daily Google-Search-Console sync outcome — synced / skipped / failed (3.3.3)
  'cron_sync_sweeper', // 15-min sync-engine watchdog — dispatched>0 means the Convex scan lagged (3.4.9)
  'cron_affiliations', // nightly corp-affiliation refresh outcome — busy / refreshed (3.7.3.2)
  'eve_token_refresh_invalid_grant', // EVE rejected the submitted refresh token as invalid / expired / revoked
  'eve_token_refresh_timeout', // the EVE SSO refresh request exceeded the shared outbound timeout
  'eve_token_refresh_connection', // the EVE SSO refresh request failed before an HTTP response
  'eve_token_refresh_provider_5xx', // EVE SSO returned a provider-side 5xx response
  'eve_token_refresh_unexpected', // any other non-success or malformed EVE SSO refresh response
  'eve_token_refresh_race', // a vend hit invalid_grant on a token a concurrent vend had already rotated — the signal EVE has enabled invalidating refresh-token rotation (OOB-AUTH)
  'account_purge', // a self-service character-purge or account-nuke completed (ACCOUNT.2). IDENTITY-FREE (D-6): logged with NO character id; metadata carries only { scope: 'character' | 'account' }
  'auth_absorb', // "Add character" absorbed a stray duplicate account via the OAuth proof (ACCOUNT.3). Audit trail for a disputed move; metadata carries { fromUserId, toUserId, sourceDeleted }
] as const;

/**
 * Closed enumeration of recognised actions. Extending: add to the client or
 * server list above. No migration needed because the DB column is plain text.
 */
export const USAGE_ACTIONS = [
  ...CLIENT_USAGE_ACTIONS,
  ...SERVER_USAGE_ACTIONS,
] as const;

/** Closed telemetry action vocabulary accepted by usage aggregation queries. */
export type UsageAction = (typeof USAGE_ACTIONS)[number];

/** Absolute telemetry query window with inclusive from and exclusive to timestamps. */
export interface DateRange {
  from: Date;
  to: Date;
}

/** UTC day bucket and absolute event count for one telemetry action. */
export interface DailyCount {
  day: string;
  totalEvents: number;
  uniqueCharacters: number;
  anonymousEvents: number;
}

/** Normalized public path and absolute view count. */
export interface PathCount {
  path: string;
  count: number;
}

/** Normalized search term and absolute usage count. */
export interface SearchCount {
  query: string;
  count: number;
}

/** Normalized referrer host and absolute referred-session count. */
export interface ReferrerCount {
  host: string;
  count: number;
}

/** Normalized landing path and absolute entry-session count. */
export interface EntryPageCount {
  path: string;
  count: number;
}

/** Privacy-safe administrator role-change record with actor, target, transition, and absolute timestamp. */
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

/**
 * ESI source health: ESI vs Fuzzwork-fallback row counts from `cron_prices`
 * refreshed rows, with a per-day series for the trend chart.
 */
export interface FallbackRateData {
  esi: number;
  fallback: number;
  perDay: { day: string; esi: number; fallback: number }[];
}

/**
 * One cron `outcome` value with its run count and average duration. Duration
 * is averaged only over rows that recorded a numeric `durationMs`.
 */
export interface CronOutcomeCount {
  outcome: string;
  count: number;
  avgDurationMs: number;
}

/**
 * Latest recorded run per cron action, regardless of the dashboard's selected
 * range — the status strip's staleness anchor ("last run 2h ago").
 */
export interface CronLastRun {
  action: UsageAction;
  timestamp: Date;
  outcome: string | null;
}

/**
 * Per-caller degradation-event counts. `caller` exists only on
 * `price_source_degraded` rows (emitted only when degraded), so this counts
 * degradation events by origin — there is no full-refresh denominator.
 */
export interface DegradationCallerCount {
  caller: string;
  count: number;
}

/** Per-day fetched/written totals from `cron_prices` refreshed rows. */
export interface RefreshVolumePoint {
  day: string;
  fetched: number;
  written: number;
}

/** Aggregate returning-vs-new user counts. Counts only — no identity surfaced. */
export interface ReturningVsNew {
  newUsers: number;
  returning: number;
}

/** Direct (no external referrer) vs referred page-view counts. */
export interface SearchVsDirect {
  referred: number;
  direct: number;
}
