import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { AdminActivitySummary } from './AdminActivitySummary';
import { RoleToggleForm } from '@/features/auth/components/RoleToggleForm';
import { auth } from '@/features/auth/auth';
import {
  CHARACTER_SEARCH_LIMIT,
  getUserByCharacterId,
  listAdminUsers,
  searchUsersByLinkedCharacterName,
  type AdminUser,
} from '@/features/auth/queries';
import { sanitiseUserText } from '@/lib/sanitise';

const MAX_QUERY_LENGTH = 200;

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
async function buildAdminList(): Promise<
  Array<{ user: AdminUser; isSuperadmin: boolean }>
> {
  const dbAdmins = await listAdminUsers();
  const superId = Number(process.env.SUPERADMIN_CHARACTER_ID);
  const haveSuperId = Number.isFinite(superId) && superId > 0;
  const alreadyListed = dbAdmins.some(a => a.characterId === superId);

  const rows = dbAdmins.map(u => ({ user: u, isSuperadmin: u.characterId === superId }));
  if (haveSuperId && !alreadyListed) {
    const superUser = await getUserByCharacterId(superId);
    if (superUser) rows.unshift({ user: superUser, isSuperadmin: true });
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
        <img
          src={user.portraitUrl}
          alt={user.name}
          width={28}
          height={28}
          loading="lazy"
          decoding="async"
          className="rounded-[2px] border border-border-idle"
        />
      }
      name={user.name}
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

async function AdminContent({
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

  const [adminRows, searchResults] = await Promise.all([
    buildAdminList(),
    query ? searchUsersByLinkedCharacterName(query) : Promise.resolve([] as AdminUser[]),
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
      <header className="w-full max-w-[1100px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Admin
        </div>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          {adminRows.length} admin{adminRows.length === 1 ? '' : 's'}
          {query ? ` · search "${query}"` : ''}
        </div>
      </header>

      <div className="w-full max-w-[1100px] flex flex-col gap-6">
        <AdminActivitySummary />

        <form method="GET" action="/admin" className="flex items-center gap-2">
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
            <a
              href="/admin"
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted px-2 py-1"
            >
              Clear
            </a>
          ) : null}
        </form>

        <Card>
          <SectionHeader
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
      </div>
    </>
  );
}

function AdminLoading() {
  return (
    <span className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</span>
  );
}

// Per-user, session-gated: the content (auth check, redirect, DB reads) is a
// fully request-time dynamic hole. Only the page container prerenders.
export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-20 gap-0">
      <Suspense fallback={<AdminLoading />}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
