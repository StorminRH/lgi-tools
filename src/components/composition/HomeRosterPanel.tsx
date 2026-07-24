'use client';

// The home page's logged-in left slot (P3b): the pilot's character roster with a
// live skill-queue preview per character, plus an Add Character control. The live
// data is the per-character skills read from /api/account/skills (MIGRATE.B.1 — the
// queue moved off the live Convex engine onto a Neon stale-gated on-view read),
// joined with the linked-character list (names/portraits, fetched from the account
// endpoint). The current-training line counts down client-side from the active
// entry's absolute finish_date (progress.ts) against a 30s clock — no reload, no
// polling. A `demo` prop seeds the presentational cards directly for the dev/preview
// ?demo review, bypassing auth + the fetch entirely. This is the `shared` zone, the
// only layer permitted to compose features + data + ui + lib.
import { type ReactNode, useEffect, useState } from 'react';
import type { PanelCharacter } from '@/components/live-character-card';
import { SectionLabel } from '@/components/ui/section-label';
import { accountCharactersEndpoint } from '@/platform/auth/api-contract';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { RosterCard } from '@/features/skill-queue/components/RosterCard';
import { buildRosterCard, type RosterViewModel } from '@/features/skill-queue/roster-view-model';
import { useSkillsLive } from '@/features/skill-queue/use-skills-live';
import { apiFetch } from '@/transport/api-client';

/**
 * Loads and renders the signed-in character roster, or renders supplied demo rows; account loading
 * and empty states remain contained in the panel.
 */
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
    return <p className="text-ui text-muted">Loading characters…</p>;
  }
  if (state === 'error') {
    return (
      <p className="text-ui text-muted">
        Could not load your characters — reload the page to try again.
      </p>
    );
  }
  if (state.characters.length === 0) {
    return (
      <p className="text-ui text-muted">
        No characters linked yet — add one below to see its skill queue here.
      </p>
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
