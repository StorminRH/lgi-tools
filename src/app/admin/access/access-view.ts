import { getRoleChangeAudit } from '@/data/telemetry/queries';
import { CHARACTER_SEARCH_LIMIT, type AdminUser } from '@/features/auth/queries';

type AuditRow = Awaited<ReturnType<typeof getRoleChangeAudit>>[number];

/** Timestamp for the audit table: "YYYY-MM-DD HH:MM" in UTC. */
export function formatDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * The Admins list: each DB admin, plus the env superadmin synthetically (when
 * their DB role isn't already ADMIN) so they're never invisible on the page they
 * govern. The superadmin is matched by the USER that owns the env character id
 * (a pilot can link several characters), passed in already resolved.
 */
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

/** The role chip for an admin row: superadmin/admin are purple, a plain user blue. */
export function adminRoleBadge(opts: { isSuperadmin: boolean; role: string }): {
  tone: 'purple' | 'blue';
  label: string;
} {
  if (opts.isSuperadmin) return { tone: 'purple', label: 'Superadmin' };
  if (opts.role === 'ADMIN') return { tone: 'purple', label: 'Admin' };
  return { tone: 'blue', label: 'User' };
}

/** One audit row's rendered fields: labels (with id fallbacks) + role-pill tones. */
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

/**
 * The Access page's derived view: the admin count + subtitle bits, the search
 * results with admins filtered out (and the truncation flag from the one-past-cap
 * probe), and the results-card hint.
 */
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
  // The search fetches one row past the cap as a truncation probe; a full extra
  // row means the match set was cut off (not naturally cap-sized).
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
