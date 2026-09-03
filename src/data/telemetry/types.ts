export const CLIENT_USAGE_ACTIONS = ['page_view', 'terminal_search'] as const;

export type ServerUsageAction =
  | 'auth_login'
  | 'auth_logout'
  | 'role_change'
  | 'character_switch'
  | 'character_unlink'
  | 'admin_character_unlink'
  | 'admin_force_logout'
  | 'admin_character_reassign'
  | 'admin_esi_job_requeued'
  | 'feedback_submitted'
  | 'cross_origin_mutation'

  | 'price_source_degraded'
  | 'market_price_refresh'
  | 'market_price_write_behind'
  | 'market_history_refresh'
  | 'market_history_write_behind'
  | 'owned_data_read'
  | 'planner_open_timing'
  | 'neon_cold_start_retry'
  | 'public_esi_budget_alert_claimed'
  | 'public_esi_budget_alerted'
  | 'cron_prices'
  | 'cron_industry_indices'
  | 'cron_sde'
  | 'cron_gsc'
  | 'cron_sync_sweeper'
  | 'cron_esi_refresh_jobs'
  | 'cron_affiliations'
  | 'cron_wh_statics'
  | 'cron_map_purge'
  | 'eve_token_refresh_invalid_grant'
  | 'eve_token_refresh_timeout'
  | 'eve_token_refresh_connection'
  | 'eve_token_refresh_provider_5xx'
  | 'eve_token_refresh_unexpected'
  | 'eve_token_refresh_race'
  | 'account_purge'
  | 'auth_absorb'
  | 'capability_outcome';

export type UsageAction = (typeof CLIENT_USAGE_ACTIONS)[number] | ServerUsageAction;

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

export interface FallbackRateData {
  esi: number;
  fallback: number;
  perDay: { day: string; esi: number; fallback: number }[];
}

export interface CronOutcomeCount {
  outcome: string;
  count: number;
  avgDurationMs: number;
}

export interface CronLastRun {
  action: UsageAction;
  timestamp: Date;
  outcome: string | null;
}

export interface DegradationCallerCount {
  caller: string;
  count: number;
}

export interface RefreshVolumePoint {
  day: string;
  fetched: number;
  written: number;
}

export interface ReturningVsNew {
  newUsers: number;
  returning: number;
}

export interface SearchVsDirect {
  referred: number;
  direct: number;
}
