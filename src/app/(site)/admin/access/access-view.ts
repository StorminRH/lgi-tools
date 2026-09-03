import { getRoleChangeAudit } from '@/data/telemetry/queries';
import { CHARACTER_SEARCH_LIMIT, type AdminUser } from '@/platform/auth/admin-users';

export type AuditRow = Awaited<ReturnType<typeof getRoleChangeAudit>>[number];

export function formatDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

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
    timestamp: formatDateTime(row.timestamp),
    actorLabel: row.actorName ?? `id ${row.actorCharacterId ?? '?'}`,
    targetLabel: row.targetName ?? `id ${row.targetCharacterId ?? '?'}`,
    fromTone: row.from === 'ADMIN' ? 'purple' : 'blue',
    fromLabel: row.from ?? '?',
    toTone: row.to === 'ADMIN' ? 'purple' : 'blue',
    toLabel: row.to ?? '?',
  };
}

export function deriveAccessView(opts: {
  adminRows: ReadonlyArray<{ user: { userId: string } }>;
  searchResults: AdminUser[];
  query: string | undefined;
}): {
  adminCount: number;
  adminPlural: string;
  querySuffix: string;
  hasQuery: boolean;
  nonAdminMatches: AdminUser[];
  searchTruncated: boolean;
  resultsHint: string;
} {
  const adminUserIds = new Set(opts.adminRows.map((r) => r.user.userId));

  const searchTruncated = opts.searchResults.length > CHARACTER_SEARCH_LIMIT;
  const nonAdminMatches = opts.searchResults
    .slice(0, CHARACTER_SEARCH_LIMIT)
    .filter((u) => !adminUserIds.has(u.userId));
  const adminCount = opts.adminRows.length;
  return {
    adminCount,
    adminPlural: adminCount === 1 ? '' : 's',
    querySuffix: opts.query ? ` · search "${opts.query}"` : '',
    hasQuery: opts.query !== undefined,
    nonAdminMatches,
    searchTruncated,
    resultsHint:
      `${nonAdminMatches.length} match${nonAdminMatches.length === 1 ? '' : 'es'}` +
      (searchTruncated ? ` · showing first ${CHARACTER_SEARCH_LIMIT}, narrow your search` : ''),
  };
}
