import { getRoleChangeAudit } from '@/data/telemetry/queries';
import { formatCount } from '@/lib/format/number';
import { formatUtcMinute } from '@/lib/format/time';
import { sanitiseUserText } from '@/lib/sanitise';
import { CHARACTER_SEARCH_LIMIT, type AdminUser } from '@/platform/auth/admin-users';

export type AuditRow = Awaited<ReturnType<typeof getRoleChangeAudit>>[number];

export function mergeAdminRows(
  dbAdmins: AdminUser[],
  superUser: AdminUser | null,
): Array<{ user: AdminUser; isSuperadmin: boolean }> {
  const superUserId = superUser?.userId ?? null;
  const rows = dbAdmins.map((u) => ({ user: u, isSuperadmin: u.userId === superUserId }));
  if (superUser && !dbAdmins.some((a) => a.userId === superUserId)) {
    rows.unshift({ user: superUser, isSuperadmin: true });
  }
  return rows;
}

export function adminRoleBadge(opts: { isSuperadmin: boolean; role: string }): {
  tone: 'purple' | 'blue';
  label: string;
} {
  if (opts.isSuperadmin) return { tone: 'purple', label: 'Superadmin' };
  if (opts.role === 'ADMIN') return { tone: 'purple', label: 'Admin' };
  return { tone: 'blue', label: 'User' };
}

export function deriveAuditRowView(row: AuditRow): {
  timestamp: string;
  actorLabel: string;
  targetLabel: string;
  fromTone: 'purple' | 'blue';
  fromLabel: string;
  toTone: 'purple' | 'blue';
  toLabel: string;
} {
  return {
    timestamp: formatUtcMinute(row.timestamp, { zone: false }),
    actorLabel: row.actorName ?? (row.actorCharacterId == null ? 'Unknown actor' : `Character ${row.actorCharacterId}`),
    targetLabel: row.targetName ?? (row.targetCharacterId == null ? 'Unknown target' : `Character ${row.targetCharacterId}`),
    fromTone: row.from === 'ADMIN' ? 'purple' : 'blue',
    fromLabel: row.from ?? '?',
    toTone: row.to === 'ADMIN' ? 'purple' : 'blue',
    toLabel: row.to ?? '?',
  };
}

/** Search matches without the admins already listed above them, and how many there are. */
export function deriveAccessView(opts: {
  adminRows: ReadonlyArray<{ user: { userId: string } }>;
  searchResults: AdminUser[];
}): {
  nonAdminMatches: AdminUser[];
  resultsHint: string;
} {
  const adminUserIds = new Set(opts.adminRows.map((r) => r.user.userId));
  const searchTruncated = opts.searchResults.length > CHARACTER_SEARCH_LIMIT;
  const nonAdminMatches = opts.searchResults
    .slice(0, CHARACTER_SEARCH_LIMIT)
    .filter((u) => !adminUserIds.has(u.userId));
  const matches = formatCount(nonAdminMatches.length, 'match', 'matches');
  return {
    nonAdminMatches,
    resultsHint: searchTruncated ? `${matches} · showing first ${CHARACTER_SEARCH_LIMIT}, narrow your search` : matches,
  };
}

export const MAX_QUERY_LENGTH = 200;

/** The search box's text, cleaned, or undefined when there is nothing to search for. */
export function sanitiseQuery(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = sanitiseUserText(raw, MAX_QUERY_LENGTH);
  return cleaned.length === 0 ? undefined : cleaned;
}
