import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { CharacterPanelSkeleton } from '@/components/composition/CharacterPanelSkeleton';
import { Callout } from '@/components/ui/callout';
import { Collapsible, CollapsibleChevron } from '@/components/ui/collapsible';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { ExternalLink, inlineLink } from '@/components/ui/text-link';
import { getFullSession } from '@/composition/session';
import { GrantedScopesList } from '@/components/composition/account/GrantedScopesList';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { LinkedCharactersCard } from '@/components/composition/account/LinkedCharactersCard';
import { SwitchCharacterForm } from '@/components/composition/account/SwitchCharacterForm';
import { UnlinkCharacterForm } from '@/components/composition/account/UnlinkCharacterForm';
import { EVE_AUTHORIZED_APPS_URL } from '@/platform/auth/eve-sso-constants';
import { listLinkedCharacters, type LinkedCharacter } from '@/platform/auth/linked-characters';
import { resolveErrorMessage } from '@/lib/error-copy';
import { QuietSectionHead } from '@/components/ui/section-head';
import { deriveCharacterRowView } from './characters-view';

const ERROR_MESSAGES: Record<string, string> = {
  account_already_linked_to_different_user: 'That character is already linked to another account.',
  last_character: "You can't unlink your only character.",
  not_linked: "That character isn't linked to your account.",
  unlink_failed: 'Could not remove that character. Please try again.',
  "email_doesn't_match": 'Linking failed. Please try again.',
};

type CharactersSearchParams = Promise<{ error?: string | string[] }>;

function CharacterRowActions({
  characterId,
  isActive,
  isOnlyCharacter,
  needsReconnect,
}: {
  characterId: number;
  isActive: boolean;
  isOnlyCharacter: boolean;
  needsReconnect: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 max-sm:justify-start">
      {needsReconnect ? (
        <LinkCharacterButton label="Reconnect" emphasis="reconnect" />
      ) : null}
      {isActive ? null : <SwitchCharacterForm characterId={characterId} />}
      <UnlinkCharacterForm characterId={characterId} disabled={isOnlyCharacter} />
    </div>
  );
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
  const view = deriveCharacterRowView(character);

  return (
    <div className="border-t border-border-soft">
      <EntityRow
        className="border-t-0 max-sm:gap-y-2 max-sm:py-2 max-sm:*:nth-[n+3]:col-start-2 max-sm:*:nth-[n+3]:justify-start"
        colsClass="grid-cols-[36px_minmax(0,1fr)] sm:grid-cols-[36px_minmax(0,1fr)_auto_auto]"
        leading={
          <CharacterPortrait
            characterId={character.characterId}
            name={character.name}
            size={28}
            src={character.portraitUrl}
          />
        }
        name={character.name}
        chips={
          <span className="flex flex-wrap items-center gap-[6px]">
            <Pill tone="neutral">ID {character.characterId}</Pill>
            {isActive ? <Pill tone="green">Active</Pill> : null}
            {view.healthLabel ? (
              <Pill tone="orange" className="shrink-0 normal-case">
                {view.healthLabel}
              </Pill>
            ) : null}
          </span>
        }
        trailing={
          <CharacterRowActions
            characterId={character.characterId}
            isActive={isActive}
            isOnlyCharacter={isOnlyCharacter}
            needsReconnect={view.needsReconnect}
          />
        }
      />
      {view.authorizationDelayed ? (
        <Callout className="mx-3.5 my-2" label="Verification delayed">
          We couldn&apos;t verify this character with EVE. Shared access through this character is
          paused while we retry automatically. Access resumes when verification succeeds.
        </Callout>
      ) : null}
      {view.scopes.length > 0 ? (
        <Collapsible
          className="border-b-0"
          headerClassName="px-3.5 py-[6px]"
          header={
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-label uppercase tracking-label text-muted">
                Granted access
              </span>
              <Pill tone="neutral">{view.scopes.length}</Pill>
              <CollapsibleChevron className="ml-auto" />
            </span>
          }
        >
          <GrantedScopesList scopes={view.scopes} />
        </Collapsible>
      ) : null}
    </div>
  );
}

async function CharactersContent({ searchParams }: { searchParams: CharactersSearchParams }) {
  const session = await getFullSession();
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const [{ error: rawError }, characters] = await Promise.all([
    searchParams,
    listLinkedCharacters(session.user.id),
  ]);
  const error = resolveErrorMessage(rawError, ERROR_MESSAGES, 'Linking was cancelled or failed.');
  const isOnlyCharacter = characters.length <= 1;

  return (
    <>
      {error ? <Callout label="Heads up">{error}</Callout> : null}

      <LinkedCharactersCard
        label="Your characters"
        count={characters.length}
        rows={characters.map((character) => (
          <CharacterRow
            key={character.characterId}
            character={character}
            isActive={character.characterId === session.characterId}
            isOnlyCharacter={isOnlyCharacter}
          />
        ))}
      >
        <div className="border-t border-border-soft px-3.5 py-3">
          <LinkCharacterButton label="Link another character" />
        </div>
        <div className="border-t border-border-soft px-3.5 py-2.5 text-ui leading-relaxed text-muted">
          Manage EVE access:{' '}
          <ExternalLink href={EVE_AUTHORIZED_APPS_URL} className={inlineLink}>
            EVE authorized apps
          </ExternalLink> ·{' '}
          <Link href="/legal" className={inlineLink}>
            Data policy
          </Link>
          {' '}·{' '}
          <Link href="/settings/account" className={inlineLink}>
            Purge data
          </Link>
          .
        </div>
      </LinkedCharactersCard>
    </>
  );
}

export default function CharactersSettingsPage({
  searchParams,
}: {
  searchParams: CharactersSearchParams;
}) {
  return (
    <>
      <QuietSectionHead title="Characters" />
      <Suspense fallback={<CharacterPanelSkeleton label="Loading linked characters" />}>
        <CharactersContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
