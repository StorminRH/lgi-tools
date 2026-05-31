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
  'feedback_submitted',
  'contact_submitted',
  // 3.0.10 observability:
  'price_source_degraded', // ESI→Fuzzwork degradation / budget exhaustion (O-1, S-2)
  'cron_prices', // hourly price-cron outcome — refreshed / skipped (O-2, O-3)
  'cron_sde', // weekly SDE-cron outcome (O-2, O-3)
] as const;

// Closed enumeration of recognised actions. Extending: add to the client or
// server list above. No migration needed because the DB column is plain text.
export const USAGE_ACTIONS = [
  ...CLIENT_USAGE_ACTIONS,
  ...SERVER_USAGE_ACTIONS,
] as const;

export type UsageAction = (typeof USAGE_ACTIONS)[number];

export interface UsageLog {
  id: number;
  timestamp: Date;
  characterId: number | null;
  action: UsageAction;
  metadata: Record<string, unknown>;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface AggregateSummary {
  totalEvents: number;
  uniqueCharacters: number;
  anonymousEvents: number;
}

export interface ActionCount {
  action: UsageAction;
  count: number;
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

export interface SitesViewSplit {
  cards: number;
  table: number;
}

export interface ReferrerCount {
  host: string;
  count: number;
}

export interface UtmSourceCount {
  source: string;
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
