'use client';

// The home page's logged-in left slot (P3b): the pilot's character roster with a
// live skill-queue preview per character, plus an Add Character control. The live
// data is the existing presence-gated skills sync (api.skills.forViewer) joined
// with the linked-character list (names/portraits, fetched from the account
// endpoint) — no new sync subject, no forked fetch. Mirrors the SkillQueuePanel
// container/presentational split and reuses its shared live primitives. A `demo`
// prop seeds the presentational cards directly for the dev/preview ?demo review,
// bypassing auth + Convex entirely. This is the `shared` zone, the only layer
// permitted to compose features + data + ui + lib.
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { type ReactNode, useEffect, useState } from 'react';
import {
  LiveSessionGate,
  type PanelCharacter,
  useLiveCharacterSync,
} from '@/components/live-character-card';
import { SectionLabel } from '@/components/ui/section-label';
import { api } from '@/data/convex/api';
import { accountCharactersEndpoint } from '@/features/auth/api-contract';
import { LinkCharacterButton } from '@/features/auth/components/LinkCharacterButton';
import { RosterCard } from '@/features/skill-queue/components/RosterCard';
import { buildRosterCard, type RosterViewModel } from '@/features/skill-queue/roster-view-model';
import { apiFetch } from '@/lib/api-client';

type LiveCharacter = NonNullable<
  FunctionReturnType<typeof api.skills.forViewer>
>['characters'][number];

// Resolve names for every queued skill (the shared cap is applied by the hook).
// The displayed skill can sit at any position when ESI hasn't advanced a finished
// head, so resolving the whole queue keeps the current-skill name correct.
// Module-stable for the hook's dependency list.
function queueSkillIds(characters: LiveCharacter[]): number[] {
  const ids: number[] = [];
  for (const character of characters) {
    for (const entry of character.data?.entries ?? []) ids.push(entry.skill_id);
  }
  return ids;
}

export function HomeRosterPanel({ demo }: { demo?: RosterViewModel[] }) {
  return (
    <RosterFrame>{demo !== undefined ? <RosterList items={demo} /> : <LiveRoster />}</RosterFrame>
  );
}

function RosterFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 pt-2">
      <SectionLabel>Your characters</SectionLabel>
      {children}
      <div>
        <LinkCharacterButton label="Add character" callbackURL="/" />
      </div>
    </div>
  );
}

function RosterList({ items }: { items: RosterViewModel[] }) {
  return (
    <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
      {items.map((vm) => (
        <RosterCard key={vm.characterId} vm={vm} />
      ))}
    </div>
  );
}

function LiveRoster() {
  const [characters, setCharacters] = useState<PanelCharacter[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void apiFetch(accountCharactersEndpoint).then((result) => {
      if (!cancelled && result.ok) setCharacters(result.data.characters);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (characters === null) {
    return <p className="text-[11px] text-muted">Loading characters…</p>;
  }
  return (
    <LiveSessionGate
      characters={characters}
      emptyText={<>No characters linked yet — add one below to see its skill queue here.</>}
    >
      <LiveRosterCards characters={characters} />
    </LiveSessionGate>
  );
}

function LiveRosterCards({ characters }: { characters: PanelCharacter[] }) {
  const live = useQuery(api.skills.forViewer);
  const { liveByCharacter, names, now } = useLiveCharacterSync({
    live,
    dataset: 'skills',
    characterIds: characters.map((c) => c.characterId),
    extractTypeIds: queueSkillIds,
  });
  const items = characters.map((character) =>
    buildRosterCard(character, liveByCharacter.get(character.characterId), names, now),
  );
  return <RosterList items={items} />;
}
