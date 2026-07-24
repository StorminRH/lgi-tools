import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { PageHead } from '@/components/ui/page-head';
import { PageShell } from '@/components/ui/page-shell';
import { Pill } from '@/components/ui/pill';
import { EntityRow } from '@/components/ui/row';
import { SectionHeader } from '@/components/ui/section-header';
import { auth } from '@/platform/auth/auth';
import { AccountDangerZone } from '@/components/composition/account/AccountDangerZone';
import { GrantedScopesList } from '@/components/composition/account/GrantedScopesList';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { SwitchCharacterForm } from '@/components/composition/account/SwitchCharacterForm';
import { UnlinkCharacterForm } from '@/components/composition/account/UnlinkCharacterForm';
import { EVE_AUTHORIZED_APPS_URL } from '@/platform/auth/eve-sso-constants';
import { listLinkedCharacters, type LinkedCharacter } from '@/platform/auth/linked-characters';
import { resolveErrorMessage } from '@/lib/error-copy';
import { deriveAbsorbedCharacter, deriveCharacterRowView } from './characters-view';

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
    <div className="flex items-center gap-2 justify-end">
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
  // Health rollup, health-chip copy, and the granted-scope list — all derived off
  // the already-loaded grant string (no tokens, no new query).
  const view = deriveCharacterRowView(character);

  return (
    // The group owns the divider so the row and its granted-scope disclosure read
    // as one unit: EntityRow drops its own top border (the group's serves), and
    // the Collapsible drops its bottom border (the next group's top border, or the
    // footer's, separates). `cn` is tailwind-merge, so the overrides win.
    <div className="border-t border-border-soft">
      <EntityRow
        className="border-t-0"
        colsClass="grid-cols-[36px_minmax(0,1fr)_auto_auto]"
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
          <span className="flex items-center gap-[6px]">
            <Pill tone="neutral">ID {character.characterId}</Pill>
            {isActive ? <Chip tone="green">Active</Chip> : null}
            {view.healthLabel ? (
              <Chip tone="orange" className="normal-case">
                {view.healthLabel}
              </Chip>
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
      {view.scopes.length > 0 ? (
        <Collapsible
          className="border-b-0"
          headerClassName="px-3.5 py-[6px]"
          header={
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-label tracking-label uppercase text-muted">
                Granted access
              </span>
              <Pill tone="neutral">{view.scopes.length}</Pill>
              <span
                data-chevron
                className="ml-auto text-micro text-muted transition-transform inline-block shrink-0"
              >
                ▾
              </span>
            </span>
          }
        >
          <GrantedScopesList scopes={view.scopes} />
        </Collapsible>
      ) : null}
    </div>
  );
}

function CharacterNotices({
  absorbedCharacter,
  error,
}: {
  absorbedCharacter: LinkedCharacter | undefined;
  error: string | null;
}) {
  return (
    <>
      {absorbedCharacter ? (
        <Card>
          <Callout label="Character moved">
            {absorbedCharacter.name} was already linked to a separate account, so LGI.tools
            moved it into this one. Everything tracked for that character came along.
          </Callout>
        </Card>
      ) : null}
      {error ? (
        <Card>
          <Callout label="Heads up">{error}</Callout>
        </Card>
      ) : null}
    </>
  );
}

async function CharactersContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; absorbed?: string | string[] }>;
}) {
  // Session-gated (any signed-in pilot), NOT admin-gated. The active character
  // comes straight off the enriched session.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/?auth_error=login_required');
  }

  const [{ error: rawError, absorbed: rawAbsorbed }, characters] = await Promise.all([
    searchParams,
    listLinkedCharacters(session.user.id),
  ]);
  const error = resolveErrorMessage(rawError, ERROR_MESSAGES, 'Linking was cancelled or failed.');
  const isOnlyCharacter = characters.length <= 1;
  // The absorb-on-proof success note (ACCOUNT.3): the auth route appends
  // ?absorbed=<characterId> to the link-success redirect when "Add character"
  // merged a stray duplicate account. Resolved against the just-loaded roster —
  // which doubles as the whitelist: a stale or forged id doesn't resolve, so
  // nothing renders (the ERROR_MESSAGES fail-closed stance).
  const absorbedCharacter = deriveAbsorbedCharacter(rawAbsorbed, characters);

  return (
    <>
      <div className="w-full max-w-[760px]">
        <PageHead
          crumb="characters"
          title="Characters"
          subtitle={`${characters.length} linked · the active character is who the site acts as`}
        />
      </div>

      <div className="w-full max-w-[760px] flex flex-col gap-6">
        <CharacterNotices absorbedCharacter={absorbedCharacter} error={error} />

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
          <div className="px-3.5 py-2.5 border-t border-border-soft text-ui text-muted leading-relaxed">
            LGI.tools only reads the access shown above. To review or revoke it, visit your{' '}
            <a
              href={EVE_AUTHORIZED_APPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-tone-blue hover:underline"
            >
              EVE authorized apps
            </a>{' '}
            page, or see{' '}
            <Link href="/legal" className="text-tone-blue hover:underline">
              how we handle your data
            </Link>
            .
          </div>
        </Card>

        <AccountDangerZone
          characters={characters.map((c) => ({ characterId: c.characterId, name: c.name }))}
        />
      </div>
    </>
  );
}

function CharactersLoading() {
  return (
    <LoadingLabel />
  );
}

/**
 * Per-user, session-gated: the content (auth check, redirect, DB reads) is a
 * fully request-time dynamic hole. Only the page container prerenders.
 */
export default function CharactersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; absorbed?: string | string[] }>;
}) {
  return (
    <PageShell>
      <div className="flex flex-col items-center pb-20 gap-0">
        <Suspense fallback={<CharactersLoading />}>
          <CharactersContent searchParams={searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
