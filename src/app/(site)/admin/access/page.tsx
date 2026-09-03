import Link from 'next/link';
import { Suspense } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { getRoleChangeAudit, lastNDaysRange } from '@/data/telemetry/queries';
import { RoleToggleForm } from '@/components/composition/account/RoleToggleForm';
import { requireAdminPage } from '@/platform/auth/route-guards';
import {
  getUserByCharacterId,
  listAdminUsers,
  searchUsersByLinkedCharacterName,
  type AdminUser,
} from '@/platform/auth/admin-users';
import { readEnv } from '@/lib/env';
import { sanitiseUserText } from '@/lib/sanitise';
import {
  adminRoleBadge,
  deriveAccessView,
  deriveAuditRowView,
  mergeAdminRows,
} from './access-view';

const MAX_QUERY_LENGTH = 200;

const AUDIT_WINDOW_DAYS = 90;

function sanitiseQuery(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = sanitiseUserText(raw, MAX_QUERY_LENGTH);
  return cleaned.length === 0 ? undefined : cleaned;
}

async function buildAdminList(): Promise<Array<{ user: AdminUser; isSuperadmin: boolean }>> {
  const dbAdmins = await listAdminUsers();
  const superId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  const superUser =
    Number.isFinite(superId) && superId > 0 ? await getUserByCharacterId(superId) : null;
  return mergeAdminRows(dbAdmins, superUser);
}

function AdminUserRow({
  user,
  isSuperadmin,
  viewerUserId,
  currentQuery,
  showToggle,
}: {
  user: AdminUser;
  isSuperadmin: boolean;
  viewerUserId: string;
  currentQuery: string | undefined;
  showToggle: boolean;
}) {
  const badge = adminRoleBadge({ isSuperadmin, role: user.role });

  return (
    <EntityRow
      colsClass="grid-cols-[36px_minmax(0,1fr)_auto_auto_auto]"
      leading={
        <CharacterPortrait
          characterId={user.characterId ?? undefined}
          name={user.name}
          size={28}
          src={user.portraitUrl}
        />
      }
      name={
        <Link
          href={`/admin/access/${user.userId}`}
          className="hover:text-text hover:underline underline-offset-2 transition-colors"
        >
          {user.name}
        </Link>
      }
      chips={
        <span className="flex items-center gap-[6px]">
          <Pill tone="neutral">ID {user.characterId ?? '—'}</Pill>
          <Chip tone={badge.tone}>{badge.label}</Chip>
        </span>
      }
      trailing={
        showToggle ? (
          <RoleToggleForm
            targetUserId={user.userId}
            currentRole={user.role}
            viewerUserId={viewerUserId}
            currentQuery={currentQuery}
          />
        ) : (
          <span className="text-micro text-muted whitespace-nowrap italic">managed via env</span>
        )
      }
    />
  );
}

function RoleChangeAudit({ audit }: { audit: Awaited<ReturnType<typeof getRoleChangeAudit>> }) {
  const rows = audit.map(deriveAuditRowView);
  const columns = [
    { key: 'timestamp', label: 'Timestamp (UTC)', render: (row) => row.timestamp, className: 'text-text' },
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
  return (
    <Card>
      <SectionHeader
        size="md"
        label="Role change audit"
        hint={`${audit.length} entries · last ${AUDIT_WINDOW_DAYS} days`}
      />
      {audit.length === 0 ? (
        <EmptyState>No role changes in the last {AUDIT_WINDOW_DAYS} days.</EmptyState>
      ) : (
        <div className="px-3.5 py-2">
          <StaticTable
            ariaLabel="Role change audit"
            columns={columns}
            rows={rows}
            getRowKey={(row, index) => `${row.timestamp}-${index}`}
          />
        </div>
      )}
    </Card>
  );
}

function AccessSearchForm({ query }: { query: string | undefined }) {
  return (
    <form method="GET" action="/admin/access" className="flex items-center gap-2">
      <Input
        type="text"
        name="q"
        defaultValue={query ?? ''}
        placeholder="Search by character name"
        maxLength={MAX_QUERY_LENGTH}
        className="flex-1"
      />
      <Button type="submit" variant="secondary" className="text-isk">
        Search
      </Button>
      {query ? (
        <Link
          href="/admin/access"
          className="text-ui uppercase tracking-wide text-muted px-2 py-1"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

function AdminsCard({
  adminRows,
  viewerUserId,
  query,
}: {
  adminRows: Array<{ user: AdminUser; isSuperadmin: boolean }>;
  viewerUserId: string;
  query: string | undefined;
}) {
  return (
    <Card>
      <SectionHeader size="md" label="Admins" hint={`${adminRows.length} with elevated access`} />
      {adminRows.length === 0 ? (
        <EmptyState>No admins currently configured.</EmptyState>
      ) : (
        adminRows.map(({ user, isSuperadmin }) => (
          <AdminUserRow
            key={user.userId}
            user={user}
            isSuperadmin={isSuperadmin}
            viewerUserId={viewerUserId}
            currentQuery={query}
            showToggle={!isSuperadmin}
          />
        ))
      )}
    </Card>
  );
}

function SearchResultsCard({
  nonAdminMatches,
  resultsHint,
  query,
  viewerUserId,
}: {
  nonAdminMatches: AdminUser[];
  resultsHint: string;
  query: string;
  viewerUserId: string;
}) {
  return (
    <Card>
      <SectionHeader size="md" label="Search results" hint={resultsHint} />
      {nonAdminMatches.length === 0 ? (
        <EmptyState>
          No non-admin characters match &ldquo;{query}&rdquo;. Any matching admins are listed above.
        </EmptyState>
      ) : (
        nonAdminMatches.map((user) => (
          <AdminUserRow
            key={user.userId}
            user={user}
            isSuperadmin={false}
            viewerUserId={viewerUserId}
            currentQuery={query}
            showToggle={true}
          />
        ))
      )}
    </Card>
  );
}

async function AccessContent({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const session = await requireAdminPage();
  const viewerUserId = session.user.id;

  const raw = await searchParams;
  const query = sanitiseQuery(raw.q);

  const [adminRows, searchResults, audit] = await Promise.all([
    buildAdminList(),
    query ? searchUsersByLinkedCharacterName(query) : Promise.resolve([] as AdminUser[]),
    getRoleChangeAudit(lastNDaysRange(AUDIT_WINDOW_DAYS), 50),
  ]);

  const view = deriveAccessView({ adminRows, searchResults, query });

  return (
    <>
      <PageHead
        size="compact"
        crumb="access"
        title="Access"
        subtitle={
          <>
            {view.adminCount} admin{view.adminPlural}
            {view.querySuffix}
          </>
        }
        meta={
          <a
            href="/admin"
            className={cn(buttonVariants({ variant: 'secondary' }), 'text-muted hover:text-text')}
          >
            ← Dashboard
          </a>
        }
      />

      <div className="w-full flex flex-col gap-6">
        <AccessSearchForm query={query} />

        <AdminsCard adminRows={adminRows} viewerUserId={viewerUserId} query={query} />

        {query ? (
          <SearchResultsCard
            nonAdminMatches={view.nonAdminMatches}
            resultsHint={view.resultsHint}
            query={query}
            viewerUserId={viewerUserId}
          />
        ) : null}

        <RoleChangeAudit audit={audit} />
      </div>
    </>
  );
}

function AccessLoading() {
  return <LoadingLabel />;
}

export default function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  return (
    <PageShell mode="workspace">
      <div className="flex flex-col items-center pb-20 gap-0">
        <Suspense fallback={<AccessLoading />}>
          <AccessContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
