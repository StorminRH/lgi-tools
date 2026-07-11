'use client';

// The per-surface character strip (ACCOUNT.7, D-7): the account's characters as
// portrait toggles above a tracked-data panel. Dimming a portrait hides that
// character's rows on THIS surface only — the panel filters its render through
// the same preference binding (view-only: the on-view sync still fetches every
// eligible character). A scope-missing character renders dimmed-LOCKED: its
// portrait is not a toggle but the surface's compact reconnect affordance, and
// one strip-level "Reconnect to track" button appears beside the row. Both ride
// startCharacterLink — EVE SSO picks the character at its login, so every
// reconnect affordance launches the same consent; the pathname is read inside
// the click handler only (never at render — the #182 request-time lesson).
//
// Controlled on purpose: the panel owns the single usePreference binding and
// passes { dimmedIds, onChange }, so this stays a stateless shell over the
// tested character-strip-model helpers. Shared zone: it bridges the tracker
// features to the auth relink flow — features may not import auth/components;
// this zone may (the RunAsFrame edge).

import { cva } from 'class-variance-authority';
import { CharacterPortrait } from '@/components/character-portrait';
import type { PanelCharacter } from '@/components/live-character-card';
import { startCharacterLink } from '@/features/auth/components/LinkCharacterButton';
import { type StripCharacterState, stripState, toggleDimmed } from './character-strip-model';

const portraitButton = cva(
  'rounded-full transition-opacity focus-visible:outline-1 focus-visible:outline-border-active',
  {
    variants: {
      state: {
        lit: 'hover:opacity-75',
        dimmed: 'opacity-35 grayscale hover:opacity-60',
        locked: 'opacity-35 grayscale ring-1 ring-tone-orange',
      } satisfies Record<StripCharacterState, string>,
    },
  },
);

export function CharacterStrip({
  characters,
  dimmedIds,
  onChange,
}: {
  characters: PanelCharacter[];
  dimmedIds: readonly number[];
  onChange: (next: number[]) => void;
}) {
  if (characters.length === 0) return null;
  const anyLocked = characters.some((character) => character.needsReconnect);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-label tracking-[0.12em] uppercase text-muted">Tracking</span>
      <div className="flex items-center gap-1.5">
        {characters.map((character) => {
          const state = stripState(character, dimmedIds);
          const isLocked = state === 'locked';
          // One phrase names the ACTION for both the accessible name and the
          // tooltip — aria-label overrides title as the accessible name, so a
          // name-only label would leave the Hide/Show verb unannounced.
          const actionLabel = isLocked
            ? `Reconnect ${character.name} to track`
            : state === 'dimmed'
              ? `Show ${character.name}`
              : `Hide ${character.name}`;
          return (
            <button
              key={character.characterId}
              type="button"
              onClick={() => {
                if (isLocked) {
                  startCharacterLink(window.location.pathname);
                  return;
                }
                const next = toggleDimmed(dimmedIds, character);
                if (next !== null) onChange(next);
              }}
              aria-pressed={isLocked ? undefined : state === 'lit'}
              aria-label={actionLabel}
              title={actionLabel}
              className={portraitButton({ state })}
            >
              <CharacterPortrait
                characterId={character.characterId}
                name={character.name}
                size={32}
                src={character.portraitUrl}
              />
            </button>
          );
        })}
      </div>
      {anyLocked && (
        <button
          type="button"
          onClick={() => startCharacterLink(window.location.pathname)}
          className="font-mono text-ui uppercase tracking-[0.12em] px-2 py-1 border border-border-idle hover:border-border-active text-tone-orange transition-colors whitespace-nowrap"
        >
          Reconnect to track
        </button>
      )}
    </div>
  );
}
