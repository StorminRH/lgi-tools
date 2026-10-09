import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { scrollArea } from '@/components/ui/scroll-area';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { RoleToggleForm } from '@/components/composition/account/RoleToggleForm';
import { getRoleChangeAudit, lastNDaysRange } from '@/data/telemetry/queries';
import { readEnv } from '@/lib/env';
import { searchUsersByLinkedCharacterName, type AdminUser } from '@/platform/auth/admin-users';
import { USERS_HREF } from '../admin-sections';
import { getUserOwningCharacterShared, listAdminUsersShared } from '../shared-reads';
import {
  adminRoleBadge,
  deriveAccessView,
  deriveAuditRowView,
  MAX_QUERY_LENGTH,
  mergeAdminRows,
  type AuditRow,
} from './access-view';
import { AdminCharacterRow } from './AdminCharacterRow';

const AUDIT_WINDOW_DAYS = 90;

/** Every admin, with the env superadmin added or flagged. Request-cached, so search reuses it. */
export async function loadAdminRows(): Promise<Array<{ user: AdminUser; isSuperadmin: boolean }>> {
  const superId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  const [dbAdmins, superUser] = await Promise.all([
    listAdminUsersShared(),
    Number.isFinite(superId) && superId > 0 ? getUserOwningCharacterShared(superId) : Promise.resolve(null),
  ]);
  return mergeAdminRows(dbAdmins, superUser);
}

export async function loadSearchMatches(query: string) {
  const [adminRows, searchResults] = await Promise.all([loadAdminRows(), searchUsersByLinkedCharacterName(query)]);
  return deriveAccessView({ adminRows, searchResults });
}

export function loadRoleAudit(): Promise<AuditRow[]> {
  return getRoleChangeAudit(lastNDaysRange(AUDIT_WINDOW_DAYS), 50);
}

export function AccessSearchForm({ query }: { query: string | undefined }) {
  return (
    <form method="GET" action={USERS_HREF} role="search" className="flex items-center gap-2">
      <Input
        type="text"
        name="q"
        defaultValue={query ?? ''}
        placeholder="Search by character name"
        aria-label="Search by character name"
        maxLength={MAX_QUERY_LENGTH}
        className="min-w-0 flex-1"
      />
      <Button type="submit" variant="secondary" className="text-isk">
        Search
      </Button>
      {query ? (
        <Link href={USERS_HREF} className="px-2 py-1 text-ui uppercase tracking-wide text-muted">
          Clear
        </Link>
      ) : null}
    </form>
  );
}

function UserRow({
  user,
  isSuperadmin,
  viewerUserId,
  query,
}: {
  user: AdminUser;
  isSuperadmin: boolean;
  viewerUserId: string;
  query: string | undefined;
}) {
  const badge = adminRoleBadge({ isSuperadmin, role: user.role });
  return (
    <AdminCharacterRow
      name={user.name}
      characterId={user.characterId}
      portraitUrl={user.portraitUrl}
      href={`${USERS_HREF}/${user.userId}`}
      chips={<Chip tone={badge.tone}>{badge.label}</Chip>}
      actions={
        isSuperadmin ? (
          <span className="whitespace-nowrap text-micro italic text-muted">managed via env</span>
        ) : (
          <RoleToggleForm
            targetUserId={user.userId}
            currentRole={user.role}
            viewerUserId={viewerUserId}
            currentQuery={query}
          />
        )
      }
    />
  );
}

export function AdminList({
  rows,
  viewerUserId,
  query,
}: {
  rows: Array<{ user: AdminUser; isSuperadmin: boolean }>;
  viewerUserId: string;
  query: string | undefined;
}) {
  if (rows.length === 0) return <EmptyState>No admins currently configured.</EmptyState>;
  return (
    <ul>
      {rows.map(({ user, isSuperadmin }) => (
        <UserRow key={user.userId} user={user} isSuperadmin={isSuperadmin} viewerUserId={viewerUserId} query={query} />
      ))}
    </ul>
  );
}

export function SearchMatches({
  matches,
  query,
  viewerUserId,
}: {
  matches: AdminUser[];
  query: string;
  viewerUserId: string;
}) {
  if (matches.length === 0) {
    return (
      <EmptyState>
        No non-admin accounts match &ldquo;{query}&rdquo;. Any matching admins are listed above.
      </EmptyState>
    );
  }
  return (
    <ul>
      {matches.map((user) => (
        <UserRow key={user.userId} user={user} isSuperadmin={false} viewerUserId={viewerUserId} query={query} />
      ))}
    </ul>
  );
}

const AUDIT_COLUMNS = [
  {
    key: 'timestamp',
    label: 'Timestamp (UTC)',
    render: (row) => row.timestamp,
    className: 'whitespace-nowrap text-text',
  },
  { key: 'actor', label: 'Actor', render: (row) => row.actorLabel, className: 'text-text' },
  { key: 'target', label: 'Target', render: (row) => row.targetLabel, className: 'text-text' },
  {
    key: 'change',
    label: 'Change',
    render: (row) => (
      <span className="flex items-center gap-1.5">
        <Pill tone={row.fromTone}>{row.fromLabel}</Pill>
        <span className="text-muted">→</span>
        <Pill tone={row.toTone}>{row.toLabel}</Pill>
      </span>
    ),
  },
] satisfies readonly StaticTableColumn<ReturnType<typeof deriveAuditRowView>>[];

/** The audit scrolls sideways inside its card on a phone rather than widening the page. */
export function RoleAuditTable({ audit }: { audit: AuditRow[] }) {
  if (audit.length === 0) return <EmptyState>No role changes in the last {AUDIT_WINDOW_DAYS} days.</EmptyState>;
  return (
    <div className={`${scrollArea} overflow-x-auto px-3.5 py-2`}>
      <StaticTable
        ariaLabel="Role change audit"
        columns={AUDIT_COLUMNS}
        rows={audit.map(deriveAuditRowView)}
        getRowKey={(row, index) => `${row.timestamp}-${index}`}
      />
    </div>
  );
}
