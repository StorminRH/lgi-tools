import { headers } from 'next/headers';
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
import { auth } from '@/features/auth/auth';
import { LinkCharacterButton } from '@/features/auth/components/LinkCharacterButton';
import { SwitchCharacterForm } from '@/features/auth/components/SwitchCharacterForm';
import { UnlinkCharacterForm } from '@/features/auth/components/UnlinkCharacterForm';
import { listLinkedCharacters, type LinkedCharacter } from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';

// Friendly copy for the failure codes the link callback (Better Auth) and the
// unlink route can redirect back with. Whitelisted — an unrecognised code falls
// to the generic message rather than echoing a raw internal code at the pilot.
const ERROR_MESSAGES: Record<string, string> = {
  account_already_linked_to_different_user: 'That character is already linked to another account.',
  last_character: "You can't unlink your only character.",
  not_linked: "That character isn't linked to your account.",
  unlink_failed: 'Could not remove that character. Please try again.',
  "email_doesn't_match": 'Linking failed. Please try again.',
};

function errorMessage(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string') return null;
  return ERROR_MESSAGES[raw] ?? 'Linking was cancelled or failed.';
}

function CharacterRow({
  character,
  isActive,
  isOnlyCharacter,
}: {
  character: LinkedCharacter;
  isActive: boolean;
  isOnlyCharacter: boolean;
}) {
  const health = deriveCharacterHealth({
    scope: character.scope,
    hasRefreshToken: character.hasRefreshToken,
  });
  const healthLabel = !health.needsReconnect
    ? null
    : character.hasRefreshToken
      ? 'Missing scopes'
      : 'Disconnected';

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
          {isActive ? <Chip tone="green">Active</Chip> : null}
          {healthLabel ? (
            <Chip tone="orange" className="normal-case">
              {healthLabel}
            </Chip>
          ) : null}
        </span>
      }
      trailing={
        <span className="flex items-center gap-2 justify-end">
          {health.needsReconnect ? (
            <LinkCharacterButton label="Reconnect" emphasis="reconnect" />
          ) : null}
          {isActive ? null : <SwitchCharacterForm characterId={character.characterId} />}
          <UnlinkCharacterForm characterId={character.characterId} disabled={isOnlyCharacter} />
        </span>
      }
    />
  );
}

async function CharactersContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  // Session-gated (any signed-in pilot), NOT admin-gated. The active character
  // comes straight off the enriched session.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const [{ error: rawError }, characters] = await Promise.all([
    searchParams,
    listLinkedCharacters(session.user.id),
  ]);
  const error = errorMessage(rawError);
  const isOnlyCharacter = characters.length <= 1;

  return (
    <>
      <header className="w-full max-w-[760px] mb-6 pb-4 border-b border-border-soft">
        <div className="font-display font-bold text-[22px] text-name tracking-[0.06em] uppercase mb-1">
          Characters
        </div>
        <div className="text-[10px] text-muted tracking-[0.12em] uppercase">
          {characters.length} linked · the active character is who the site acts as
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
            label="Your characters"
            hint={`${characters.length} linked`}
          />
          {characters.length === 0 ? (
            <EmptyState>No characters linked to this account.</EmptyState>
          ) : (
            characters.map((character) => (
              <CharacterRow
                key={character.characterId}
                character={character}
                isActive={character.characterId === session.characterId}
                isOnlyCharacter={isOnlyCharacter}
              />
            ))
          )}
          <div className="px-3.5 py-3 border-t border-border-soft">
            <LinkCharacterButton label="Link another character" />
          </div>
        </Card>
      </div>
    </>
  );
}

function CharactersLoading() {
  return (
    <span className="text-[10px] tracking-[0.12em] uppercase text-muted">Loading…</span>
  );
}

// Per-user, session-gated: the content (auth check, redirect, DB reads) is a
// fully request-time dynamic hole. Only the page container prerenders.
export default function CharactersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  return (
    <PageShell>
      <div className="flex flex-col items-center pt-12 pb-20 gap-0">
        <Suspense fallback={<CharactersLoading />}>
          <CharactersContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
