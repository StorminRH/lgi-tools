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
  // Mobile-width cards that tile rather than stretch: each card (and its skill
  // bar) stays narrow, and up to three fit across the left column. The max-width
  // caps it at ~3 columns on a wide desktop instead of sprawling further.
  return (
    <div className="grid max-w-[760px] grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-5 gap-y-4">
      {items.map((vm) => (
        <RosterCard key={vm.characterId} vm={vm} reconnectAction={reconnectAction} />
      ))}
    </div>
  );
}

function LiveRoster() {
  // 'loading' until the roster fetch resolves; 'error' on a network rejection or
  // a non-OK response (otherwise the panel would sit on the spinner forever with
  // no recovery — and an empty-list fallback would wrongly read as "no characters
  // linked" to a pilot who has some).
  const [state, setState] = useState<{ characters: PanelCharacter[] } | 'loading' | 'error'>(
    'loading',
  );
  useEffect(() => {
    let cancelled = false;
    void apiFetch(accountCharactersEndpoint)
      .then((result) => {
        if (cancelled) return;
        setState(result.ok ? { characters: result.data.characters } : 'error');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return <p className="text-[11px] text-muted">Loading characters…</p>;
  }
  if (state === 'error') {
    return (
      <p className="text-[11px] text-muted">
        Could not load your characters — reload the page to try again.
      </p>
    );
  }
  return (
    <LiveSessionGate
      characters={state.characters}
      emptyText={<>No characters linked yet — add one below to see its skill queue here.</>}
    >
      <LiveRosterCards characters={state.characters} />
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
  return (
    <RosterList
      items={items}
      reconnectAction={
        <LinkCharacterButton label="Reconnect" emphasis="reconnect" callbackURL="/" />
      }
    />
  );
}
