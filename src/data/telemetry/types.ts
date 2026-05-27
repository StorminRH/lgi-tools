// Closed enumeration of recognised actions. Extending: add to this list,
// the route handler will start accepting it. No migration needed because
// the DB column is plain text.
export const USAGE_ACTIONS = [
  'page_view',
  'terminal_search',
  'auth_login',
  'auth_logout',
  'role_change',
  'feedback_submitted',
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

export interface RoleChangeAuditEntry {
  timestamp: Date;
  actorCharacterId: number | null;
  actorName: string | null;
  targetCharacterId: number | null;
  targetName: string | null;
  from: string | null;
  to: string | null;
}
