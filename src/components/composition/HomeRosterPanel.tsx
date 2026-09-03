'use client';

import { type ReactNode, useEffect, useState } from 'react';
import type { PanelCharacter } from '@/components/live-character-card';
import { SectionLabel } from '@/components/ui/section-label';
import { Banner } from '@/components/ui/banner';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { RosterCard } from '@/features/skill-queue/components/RosterCard';
import { buildRosterCard, type RosterViewModel } from '@/features/skill-queue/roster-view-model';
import { useSkillsLive } from '@/features/skill-queue/use-skills-live';
import { apiFetch } from '@/transport/api-client';

export function HomeRosterPanel({ demo }: { demo?: RosterViewModel[] }) {
  return (
    <RosterFrame>{demo !== undefined ? <RosterList items={demo} /> : <LiveRoster />}</RosterFrame>

  );
}

function RosterFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <SectionLabel>Your characters</SectionLabel>

      {children}
      <div>
        <LinkCharacterButton label="Add character" callbackURL="/" />
      </div>

    </div>

  );
}

function RosterList({
  items,
  reconnectAction,
}: {
  items: RosterViewModel[];
  reconnectAction?: ReactNode;
}) {

  return (
    <div className="grid max-w-[760px] grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-5 gap-y-4">
      {items.map((vm) => (
        <RosterCard key={vm.characterId} vm={vm} reconnectAction={reconnectAction} />
      ))}
    </div>

  );
}

function LiveRoster() {

  const [state, setState] = useState<{ characters: PanelCharacter[] } | 'loading' | 'error'>(
    'loading',
  );
  useEffect(() => {
    let cancelled = false;
    void apiFetchCharacters()
      .then((result) => {
        if (cancelled) return;
        setState(result);
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return <LoadingLabel label="Loading characters…" />;
  }
  if (state === 'error') {
    return (
      <Banner tone="warn">
        Could not load your characters — reload the page to try again.
      </Banner>

    );
  }
  if (state.characters.length === 0) {
    return (
      <EmptyState>
        No characters linked yet — add one below to see its skill queue here.
      </EmptyState>

    );
  }
  return <LiveRosterCards characters={state.characters} />;
}

async function apiFetchCharacters(): Promise<{ characters: PanelCharacter[] } | 'error'> {
  const result = await apiFetch(accountCharactersEndpoint);
  return result.ok ? { characters: result.data.characters } : 'error';
}

function LiveRosterCards({ characters }: { characters: PanelCharacter[] }) {
  const eligibleIds = characters
    .filter((character) => !character.needsReconnect)
    .map((character) => character.characterId);
  const { skillsByCharacter, names, now } = useSkillsLive(eligibleIds);
  const items = characters.map((character) => {
    const live = skillsByCharacter.get(character.characterId);
    return buildRosterCard(
      character,
      live !== undefined
        ? { data: live.data, lastSyncedAt: live.lastRefreshedAt, syncError: null }
        : undefined,
      names,
      now,
    );
  });
  return (
    <RosterList
      items={items}
      reconnectAction={
        <LinkCharacterButton label="Reconnect" emphasis="reconnect" callbackURL="/" />
      }
    />
  );
}
