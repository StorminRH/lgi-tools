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
import { getRoleChangeAudit, lastNDaysRange } from '@/data/telemetry/queries';
import { RoleToggleForm } from '@/features/auth/components/RoleToggleForm';
import { requireAdminPage } from '@/features/auth/route-guards';
import {
  getUserByCharacterId,
  listAdminUsers,
  searchUsersByLinkedCharacterName,
  type AdminUser,
} from '@/features/auth/queries';
import { readEnv } from '@/lib/env';
import { sanitiseUserText } from '@/lib/sanitise';
import {
  adminRoleBadge,
  deriveAccessView,
  deriveAuditRowView,
  mergeAdminRows,
} from './access-view';

const MAX_QUERY_LENGTH = 200;

// How far back the audit table reaches. Role changes are rare; a fixed window
// keeps the page free of the dashboard's range selector.
const AUDIT_WINDOW_DAYS = 90;

// Strip control chars + truncate. Returns undefined for empty / clearly
// malformed input so the page falls back to the empty-q view.
function sanitiseQuery(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = sanitiseUserText(raw, MAX_QUERY_LENGTH);
  return cleaned.length === 0 ? undefined : cleaned;
}

// Build the Admins list shown above the search results. Admin is per-user;
// includes the env superadmin synthetically (resolved from their character id to
// the owning user) when their DB role isn't already ADMIN — otherwise they'd be
// invisible on the page they have authority over.
async function buildAdminList(): Promise<Array<{ user: AdminUser; isSuperadmin: boolean }>> {
  const dbAdmins = await listAdminUsers();
  const superId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  // Identify the superadmin by the USER that owns the env character id, not by a
  // displayed character id: a pilot can now link several characters (3.4.2).
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

function AuditRow({ view }: { view: ReturnType<typeof deriveAuditRowView> }) {
  return (
    <tr className="border-t border-border-soft">
      <td className="py-1.5 text-text">{view.timestamp}</td>
      <td className="py-1.5 text-text">{view.actorLabel}</td>
      <td className="py-1.5 text-text">{view.targetLabel}</td>
      <td className="py-1.5">
        <span className="flex items-center gap-1.5">
          <Pill tone={view.fromTone}>{view.fromLabel}</Pill>
          <span className="text-muted">→</span>
          <Pill tone={view.toTone}>{view.toLabel}</Pill>
        </span>
      </td>
    </tr>
  );
}

function RoleChangeAudit({ audit }: { audit: Awaited<ReturnType<typeof getRoleChangeAudit>> }) {
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
          <table className="w-full font-mono text-ui">
            <thead>
              <tr className="text-label tracking-wide uppercase text-muted">
                <th className="text-left py-1.5 font-normal">Timestamp (UTC)</th>
                <th className="text-left py-1.5 font-normal">Actor</th>
                <th className="text-left py-1.5 font-normal">Target</th>
                <th className="text-left py-1.5 font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row, idx) => (
                <AuditRow key={`${row.timestamp.toISOString()}-${idx}`} view={deriveAuditRowView(row)} />
              ))}
            </tbody>
          </table>
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
          className="font-mono text-ui uppercase tracking-wide text-muted px-2 py-1"
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
  // Admin gate + viewer id come straight from the Better Auth session (the
  // shared Session type deliberately doesn't carry userId).
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

// Per-user, session-gated: the content (auth check, redirect, DB reads) is a
// fully request-time dynamic hole. Only the page container prerenders.
export default function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  return (
    <PageShell>
      <div className="flex flex-col items-center pb-20 gap-0">
        <Suspense fallback={<AccessLoading />}>
          <AccessContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
