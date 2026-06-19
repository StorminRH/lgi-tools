import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { AdminForceLogoutForm } from '@/features/auth/components/AdminForceLogoutForm';
import { AdminReassignCharacterForm } from '@/features/auth/components/AdminReassignCharacterForm';
import { AdminUnlinkCharacterForm } from '@/features/auth/components/AdminUnlinkCharacterForm';
import { auth } from '@/features/auth/auth';
import {
  getActiveSessionCount,
  getStoredActiveCharacterId,
  getUserById,
  listLinkedCharacters,
  type LinkedCharacter,
} from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';

// Friendly copy for the codes the admin routes can redirect back with. An
// unrecognised code falls to the generic message rather than echoing an internal
// code at the admin.
const ERROR_MESSAGES: Record<string, string> = {
  last_character:
    "That's the user's only character — unlinking it would strand the account. Reassign it instead.",
  unlink_failed: 'Could not unlink that character. Please try again.',
};

function errorMessage(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string') return null;
  return ERROR_MESSAGES[raw] ?? 'That action could not be completed.';
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function CharacterAdminRow({
  character,
  userId,
  isActive,
  isViewerSelf,
  isOnlyCharacter,
}: {
  character: LinkedCharacter;
  userId: string;
  isActive: boolean;
  // The detail page is the acting admin's own account — reassign-to-self is a
  // no-op, so the reassign control is disabled.
  isViewerSelf: boolean;
  isOnlyCharacter: boolean;
}) {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });

  return (
    <EntityRow
      colsClass="grid-cols-[36px_minmax(0,1fr)_auto_auto]"
      leading={
        <img
          src={character.portraitUrl}
          alt={character.name}
          width={28}
          height={28}
          loading="lazy"
          decoding="async"
          className="rounded-[2px] border border-border-idle"
        />
      }
      name={character.name}
      chips={
        <span className="flex items-center gap-[6px]">
          <Pill tone="neutral">ID {character.characterId}</Pill>
          <Pill tone="neutral">linked {formatDate(character.linkedAt)}</Pill>
          {isActive ? <Chip tone="green">Active</Chip> : null}
          {health.needsReconnect ? (
            <Chip tone="orange" className="normal-case">
              {character.hasRefreshToken ? 'Missing scopes' : 'Disconnected'}
            </Chip>
          ) : null}
        </span>
      }
      trailing={
        <span className="flex items-center gap-2 justify-end">
          <AdminReassignCharacterForm
            characterId={character.characterId}
            characterName={character.name}
            fromUserId={userId}
            disabled={isViewerSelf}
          />
          <AdminUnlinkCharacterForm
            userId={userId}
            characterId={character.characterId}
            characterName={character.name}
            disabled={isOnlyCharacter}
          />
        </span>
      }
    />
  );
}

function NotFound() {
  return (
    <>
      <header className="w-full max-w-[760px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          User not found
        </div>
      </header>
      <div className="w-full max-w-[760px]">
        <Card>
          <EmptyState>No account matches that id.</EmptyState>
        </Card>
        <Link
          href="/admin/access"
          className="inline-block mt-4 font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-border-idle hover:border-border-active text-muted hover:text-text transition-colors"
        >
          ← Access
        </Link>
      </div>
    </>
  );
}

async function UserDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  // Admin gate + viewer id come straight from the Better Auth session (isAdmin is
  // computed server-side; the shared Session type doesn't carry userId).
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.isAdmin) {
    redirect('/?auth_error=admin_required');
  }
  const viewerUserId = session.user.id;

  const [{ userId }, { error: rawError }] = await Promise.all([params, searchParams]);

  const targetUser = await getUserById(userId);
  if (!targetUser) {
    return <NotFound />;
  }

  const [characters, activeId, sessionCount] = await Promise.all([
    listLinkedCharacters(userId),
    getStoredActiveCharacterId(userId),
    getActiveSessionCount(userId),
  ]);

  const error = errorMessage(rawError);
  const isViewerSelf = userId === viewerUserId;
  const isOnlyCharacter = characters.length <= 1;
  const roleChip =
    targetUser.role === 'ADMIN' ? <Chip tone="purple">Admin</Chip> : <Chip tone="blue">User</Chip>;

  return (
    <>
      <header className="w-full max-w-[760px] mb-6 pb-4 border-b border-border-soft">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={targetUser.portraitUrl}
              alt={targetUser.name}
              width={40}
              height={40}
              loading="lazy"
              decoding="async"
              className="rounded-[2px] border border-border-idle shrink-0"
            />
            <div className="min-w-0">
              <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1 truncate">
                {targetUser.name}
              </div>
              <span className="flex items-center gap-[6px]">
                <Pill tone="neutral">ID {targetUser.characterId ?? '—'}</Pill>
                {roleChip}
                {isViewerSelf ? <Chip tone="green">You</Chip> : null}
              </span>
            </div>
          </div>
          <Link
            href="/admin/access"
            className="font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-2 border border-border-idle hover:border-border-active text-muted hover:text-text transition-colors shrink-0"
          >
            ← Access
          </Link>
        </div>
      </header>

      <div className="w-full max-w-[760px] flex flex-col gap-6">
        {error ? (
          <Card>
            <Callout label="Heads up">{error}</Callout>
          </Card>
        ) : null}

        <Card>
          <SectionHeader
            size="md"
            label="Linked characters"
            hint={`${characters.length} linked`}
          />
          {characters.length === 0 ? (
            <EmptyState>No characters linked to this account.</EmptyState>
          ) : (
            characters.map((character) => (
              <CharacterAdminRow
                key={character.characterId}
                character={character}
                userId={userId}
                isActive={character.characterId === activeId}
                isViewerSelf={isViewerSelf}
                isOnlyCharacter={isOnlyCharacter}
              />
            ))
          )}
        </Card>

        <Card>
          <SectionHeader
            size="md"
            label="Sessions"
            hint={`${sessionCount} active`}
          />
          <div className="flex items-center justify-between gap-3 px-3.5 py-3 border-t border-border-soft">
            <span className="text-[11px] text-muted">
              Revoke all sign-ins for this account. May take a few minutes to fully apply.
            </span>
            <AdminForceLogoutForm
              userId={userId}
              userName={targetUser.name}
              disabled={isViewerSelf || sessionCount === 0}
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function DetailLoading() {
  return (
    <span className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</span>
  );
}

// Per-user, session-gated: the content (auth check, redirect, DB reads) is a
// fully request-time dynamic hole. Only the page container prerenders.
export default function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  return (
    <PageShell>
      <div className="flex flex-col items-center pt-12 pb-20 gap-0">
        <Suspense fallback={<DetailLoading />}>
          <UserDetailContent params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
