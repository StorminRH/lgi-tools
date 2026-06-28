import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { getRoleChangeAudit, lastNDaysRange } from '@/data/telemetry/queries';
import { RoleToggleForm } from '@/features/auth/components/RoleToggleForm';
import { auth } from '@/features/auth/auth';
import {
  CHARACTER_SEARCH_LIMIT,
  getUserByCharacterId,
  listAdminUsers,
  searchUsersByLinkedCharacterName,
  type AdminUser,
} from '@/features/auth/queries';
import { readEnv } from '@/lib/env';
import { sanitiseUserText } from '@/lib/sanitise';

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

function formatDateTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

// Build the Admins list shown above the search results. Admin is per-user;
// includes the env superadmin synthetically (resolved from their character id to
// the owning user) when their DB role isn't already ADMIN — otherwise they'd be
// invisible on the page they have authority over.
async function buildAdminList(): Promise<
  Array<{ user: AdminUser; isSuperadmin: boolean }>
> {
  const dbAdmins = await listAdminUsers();
  const superId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  const haveSuperId = Number.isFinite(superId) && superId > 0;
  // Identify the superadmin by the USER that owns the env character id, not by a
  // displayed character id: a pilot can now link several characters (3.4.2), so
  // the row's shown character isn't necessarily the superadmin one.
  const superUser = haveSuperId ? await getUserByCharacterId(superId) : null;
  const superUserId = superUser?.userId ?? null;

  const rows = dbAdmins.map(u => ({ user: u, isSuperadmin: u.userId === superUserId }));
  if (superUser && !dbAdmins.some(a => a.userId === superUserId)) {
    rows.unshift({ user: superUser, isSuperadmin: true });
  }
  return rows;
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
  const roleChip = isSuperadmin ? (
    <Chip tone="purple">Superadmin</Chip>
  ) : user.role === 'ADMIN' ? (
    <Chip tone="purple">Admin</Chip>
  ) : (
    <Chip tone="blue">User</Chip>
  );

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
          {roleChip}
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
          <span className="text-[10px] text-muted whitespace-nowrap italic">
            managed via env
          </span>
        )
      }
    />
  );
}

function RoleChangeAudit({
  audit,
}: {
  audit: Awaited<ReturnType<typeof getRoleChangeAudit>>;
}) {
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
          <table className="w-full font-mono text-[12px]">
            <thead>
              <tr className="text-[10px] tracking-[0.12em] uppercase text-muted">
                <th className="text-left py-1.5 font-normal">Timestamp (UTC)</th>
                <th className="text-left py-1.5 font-normal">Actor</th>
                <th className="text-left py-1.5 font-normal">Target</th>
                <th className="text-left py-1.5 font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row, idx) => (
                <tr
                  key={`${row.timestamp.toISOString()}-${idx}`}
                  className="border-t border-border-soft"
                >
                  <td className="py-1.5 text-text">{formatDateTime(row.timestamp)}</td>
                  <td className="py-1.5 text-text">
                    {row.actorName ?? `id ${row.actorCharacterId ?? '?'}`}
                  </td>
                  <td className="py-1.5 text-text">
                    {row.targetName ?? `id ${row.targetCharacterId ?? '?'}`}
                  </td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-1.5">
                      <Pill tone={row.from === 'ADMIN' ? 'purple' : 'blue'}>
                        {row.from ?? '?'}
                      </Pill>
                      <span className="text-muted">→</span>
                      <Pill tone={row.to === 'ADMIN' ? 'purple' : 'blue'}>{row.to ?? '?'}</Pill>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function AccessContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  // Admin gate + viewer id come straight from the Better Auth session: isAdmin
  // is computed server-side (its superadmin branch reads an env var), and the
  // viewer's userId isn't carried on the shared Session type.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    redirect('/?auth_error=admin_required');
  }
  const viewerUserId = session.user.id;

  const raw = await searchParams;
  const query = sanitiseQuery(raw.q);

  const [adminRows, searchResults, audit] = await Promise.all([
    buildAdminList(),
    query ? searchUsersByLinkedCharacterName(query) : Promise.resolve([] as AdminUser[]),
    getRoleChangeAudit(lastNDaysRange(AUDIT_WINDOW_DAYS), 50),
  ]);

  const adminUserIds = new Set(adminRows.map(r => r.user.userId));
  // searchUsersByLinkedCharacterName fetches one row past the cap as a truncation
  // probe; a full extra row means the match set was cut off (not naturally cap-sized).
  const searchTruncated = searchResults.length > CHARACTER_SEARCH_LIMIT;
  const nonAdminMatches = searchResults
    .slice(0, CHARACTER_SEARCH_LIMIT)
    .filter(u => !adminUserIds.has(u.userId));

  return (
    <>
      <PageHead
        crumb="access"
        title="Access"
        subtitle={
          <>
            {adminRows.length} admin{adminRows.length === 1 ? '' : 's'}
            {query ? ` · search "${query}"` : ''}
          </>
        }
        meta={
          <a
            href="/admin"
            className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-border-idle hover:border-border-active text-muted hover:text-text transition-colors"
          >
            ← Dashboard
          </a>
        }
      />

      <div className="w-full flex flex-col gap-6">
        <form method="GET" action="/admin/access" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query ?? ''}
            placeholder="Search by character name"
            maxLength={MAX_QUERY_LENGTH}
            className="flex-1 font-mono text-[12px] px-3 py-2 bg-bg border border-border text-text placeholder:text-muted focus:outline-none focus:border-border-active"
          />
          <button
            type="submit"
            className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-border-idle hover:border-border-active text-isk transition-colors"
          >
            Search
          </button>
          {query ? (
            <Link
              href="/admin/access"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted px-2 py-1"
            >
              Clear
            </Link>
          ) : null}
        </form>

        <Card>
          <SectionHeader
            size="md"
            label="Admins"
            hint={`${adminRows.length} with elevated access`}
          />
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

        {query ? (
          <Card>
            <SectionHeader
              size="md"
              label="Search results"
              hint={
                `${nonAdminMatches.length} match${nonAdminMatches.length === 1 ? '' : 'es'}` +
                (searchTruncated
                  ? ` · showing first ${CHARACTER_SEARCH_LIMIT}, narrow your search`
                  : '')
              }
            />
            {nonAdminMatches.length === 0 ? (
              <EmptyState>
                No non-admin characters match &ldquo;{query}&rdquo;. Any matching admins are listed above.
              </EmptyState>
            ) : (
              nonAdminMatches.map(user => (
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
        ) : null}

        <RoleChangeAudit audit={audit} />
      </div>
    </>
  );
}

function AccessLoading() {
  return (
    <LoadingLabel />
  );
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
