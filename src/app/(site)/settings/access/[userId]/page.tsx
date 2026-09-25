import Link from 'next/link';
import { Suspense } from 'react';
import { EveImage } from '@/components/eve-image';
import { buttonVariants } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { AdminForceLogoutForm } from '@/components/composition/account/AdminForceLogoutForm';
import { AdminReassignCharacterForm } from '@/components/composition/account/AdminReassignCharacterForm';
import { AdminUnlinkCharacterForm } from '@/components/composition/account/AdminUnlinkCharacterForm';
import { requireAdminPage } from '@/composition/route-guards';
import {
  getStoredActiveCharacterId,
  listLinkedCharacters,
  type LinkedCharacter,
} from '@/platform/auth/linked-characters';
import { getActiveSessionCount, getUserById } from '@/platform/auth/admin-users';
import { deriveCharacterHealth } from '@/platform/auth/scope-health';
import { resolveErrorMessage } from '@/lib/error-copy';
import { SettingsSectionHead } from '../../settings-section-head';
import { deriveUserDetailView } from './user-detail-view';

const ERROR_MESSAGES: Record<string, string> = {
  last_character:
    "That's the user's only character — unlinking it would strand the account. Reassign it instead.",
  unlink_failed: 'Could not unlink that character. Please try again.',
};

const ACCESS_HREF = '/settings/access';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function BackToAccess({ className }: { className?: string }) {
  return (
    <Link
      href={ACCESS_HREF}
      className={cn(buttonVariants({ variant: 'secondary' }), 'text-muted hover:text-text', className)}
    >
      ← Users &amp; roles
    </Link>
  );
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
        <EveImage
          source="eve"
          family="character-portrait"
          src={character.portraitUrl}
          alt={character.name}
          width={28}
          height={28}
          loading="lazy"
          decoding="async"
          className="rounded-ctl border border-border-idle"
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
        <span className="flex items-center justify-end gap-2">
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
      <SettingsSectionHead title="User not found" meta={<BackToAccess />} />
      <Card>
        <EmptyState>No account matches that id.</EmptyState>
      </Card>
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
  const session = await requireAdminPage();
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

  const error = resolveErrorMessage(rawError, ERROR_MESSAGES, 'That action could not be completed.');
  const view = deriveUserDetailView({
    targetUser,
    charactersCount: characters.length,
    sessionCount,
    viewerUserId,
    userId,
  });

  return (
    <>
      <SettingsSectionHead
        title={targetUser.name}
        leading={
          <EveImage
            source="eve"
            family="character-portrait"
            src={targetUser.portraitUrl}
            alt={targetUser.name}
            width={40}
            height={40}
            preload
            decoding="async"
            className="shrink-0 rounded-ctl border border-border-idle"
          />
        }
        chips={
          <>
            <Pill tone="neutral">ID {view.characterIdLabel}</Pill>
            {view.identityChips.map((chip) => (
              <Chip key={chip.label} tone={chip.tone}>
                {chip.label}
              </Chip>
            ))}
          </>
        }
        meta={<BackToAccess />}
      />

      {error ? <Callout label="Heads up">{error}</Callout> : null}

      <Card className="reveal reveal-1">
        <SectionHeader size="md" label="Linked characters" hint={`${characters.length} linked`} />
        {characters.length === 0 ? (
          <EmptyState>No characters linked to this account.</EmptyState>
        ) : (
          characters.map((character) => (
            <CharacterAdminRow
              key={character.characterId}
              character={character}
              userId={userId}
              isActive={character.characterId === activeId}
              isViewerSelf={view.isViewerSelf}
              isOnlyCharacter={view.isOnlyCharacter}
            />
          ))
        )}
      </Card>

      <Card className="reveal reveal-2">
        <SectionHeader size="md" label="Sessions" hint={`${sessionCount} active`} />
        <div className="flex items-center justify-between gap-3 border-t border-border-soft px-3.5 py-3">
          <span className="text-ui text-muted">
            Revoke all sign-ins for this account. May take a few minutes to fully apply.
          </span>
          <AdminForceLogoutForm
            userId={userId}
            userName={targetUser.name}
            disabled={view.forceLogoutDisabled}
          />
        </div>
      </Card>
    </>
  );
}

export default function UserDetailSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<LoadingLabel />}>
      <UserDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
