'use client';

import { cva } from 'class-variance-authority';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { CharacterPortrait } from '@/components/character-portrait';
import type { PanelCharacter } from '@/components/live-character-card';
import { startCharacterLink } from '@/platform/auth/link-character';
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
      <span className="text-label tracking-wide uppercase text-muted">Tracking</span>

      <div className="flex items-center gap-1.5">
        {characters.map((character) => {
          const state = stripState(character, dimmedIds);
          const isLocked = state === 'locked';

          const actionLabel = isLocked
            ? `Reconnect ${character.name} to track`
            : state === 'dimmed'
              ? `Show ${character.name}`
              : `Hide ${character.name}`;
          return (
            <Tooltip key={character.characterId} content={actionLabel}>
              <Button
                variant="bare"
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
                className={portraitButton({ state })}
              >
                <CharacterPortrait
                  characterId={character.characterId}
                  name={character.name}
                  size={32}
                  src={character.portraitUrl}
                />
              </Button>

            </Tooltip>

          );
        })}
      </div>

      {anyLocked && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => startCharacterLink(window.location.pathname)}
          className="text-tone-orange whitespace-nowrap"
        >
          Reconnect to track
        </Button>

      )}
    </div>

  );
}
