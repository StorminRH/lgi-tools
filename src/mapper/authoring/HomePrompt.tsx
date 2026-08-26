'use client';

import { useId, useRef } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import {
  useAccountCharacters,
  useActiveCharacterId,
} from '@/components/use-account-characters';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { TerminalSearch } from '@/components/ui/terminal-search';
import {
  useSystemName,
  useSystemSearch,
  type SystemErr,
  type SystemParams,
} from '@/components/use-system-search';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useSetMapTracking } from '../tracking/TrackingControls';
import { coverageQueryArgs } from '../tracking/presence-model';
import { homeCurrentSystem, type HomeCurrentSystem } from './home-prompt-model';

/** Props for the empty-map home-system prompt. */
export interface HomePromptProps {
  readonly mapId: string;
  readonly onPick: (systemId: number) => void;
}

/**
 * Required first-run Dialog: system search plus current-system / start-tracking.
 * Stays open (`open` held true, no close control) until the host unmounts it
 * after a home system is set. Renders only when the host has already gated on
 * `canEdit` and a complete empty systems page. Portrait toggles opt in any
 * linked character — not only the session character — so an in-space alt can
 * supply the current system.
 */
export function HomePrompt({ mapId, onPick }: HomePromptProps) {
  const { parse, suggest } = useSystemSearch();
  const titleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const characterId = useActiveCharacterId();
  const characters = useAccountCharacters();
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const coverage = useLiveValue(
    api.mapTrackingLive.coverage,
    coverageQueryArgs(mapId, tracking),
  );
  const setTracking = useSetMapTracking();
  const current = homeCurrentSystem({ characterId, tracking, coverage });
  const currentSystemId = current.kind === 'ready' ? current.systemId : null;
  const currentSystemName = useSystemName(currentSystemId);
  const trackedIds = new Set(tracking?.ownTrackedCharacterIds ?? []);

  return (
    <Dialog
      open
      labelledBy={titleId}
      initialFocus={searchInputRef}
      className="w-[min(24rem,calc(100vw-2rem))] p-5"
    >
      <div
        data-map-home-prompt
        data-map-id={mapId}
        className="flex flex-col gap-4"
      >
        <DialogTitle
          id={titleId}
          className="text-center font-display text-title font-bold tracking-copy text-name"
        >
          Set your home system
        </DialogTitle>
        <TerminalSearch<SystemParams, SystemErr>
          initialValue=""
          placeholder="Search systems — type a name"
          parse={parse}
          suggest={suggest}
          inputRef={searchInputRef}
          errorMessage={() => 'No system matches that name.'}
          onSubmit={(params) => onPick(params.system.id)}
          onClear={() => undefined}
          errorLabel="System"
        />
        {characters !== null && characters.length > 0 ? (
          <div
            data-map-home-tracking
            className="flex flex-col gap-2"
            role="group"
            aria-label="Tracking"
          >
            <span className="font-ui text-micro text-muted">
              Track a character in space
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {characters.map((character) => {
                const pressed = trackedIds.has(character.characterId);
                return (
                  <Button
                    key={character.characterId}
                    type="button"
                    variant="bare"
                    aria-pressed={pressed}
                    aria-label={`${pressed ? 'Stop tracking' : 'Track'} ${character.name}`}
                    data-map-home-track-character={character.characterId}
                    className={cn(
                      'box-border flex size-10 shrink-0 items-center justify-center rounded-full border-2 p-0.5 leading-none outline-none transition-[border-color,opacity,filter] motion-reduce:transition-none',
                      pressed
                        ? 'border-isk opacity-100 grayscale-0'
                        : 'border-transparent opacity-35 grayscale',
                    )}
                    onClick={() => {
                      void setTracking({
                        mapId,
                        characterId: character.characterId,
                        tracked: !pressed,
                      });
                    }}
                  >
                    <CharacterPortrait
                      characterId={character.characterId}
                      name={character.name}
                      size={32}
                      src={character.portraitUrl}
                    />
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}
        <CurrentSystemControl
          current={current}
          currentSystemName={currentSystemName}
          onPick={onPick}
          onStartTracking={() => {
            if (characterId === null) return;
            void setTracking({ mapId, characterId, tracked: true });
          }}
        />
      </div>
    </Dialog>
  );
}

function CurrentSystemControl({
  current,
  currentSystemName,
  onPick,
  onStartTracking,
}: {
  readonly current: HomeCurrentSystem;
  readonly currentSystemName: string | null;
  readonly onPick: (systemId: number) => void;
  readonly onStartTracking: () => void;
}) {
  if (current.kind === 'untracked') {
    return (
      <Button
        type="button"
        variant="secondary"
        data-map-home-start-tracking
        className="w-full"
        onClick={onStartTracking}
      >
        Start tracking
      </Button>
    );
  }

  const ready = current.kind === 'ready';
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={!ready}
      data-map-home-current-disabled={ready ? undefined : true}
      data-map-home-current={ready ? current.systemId : undefined}
      className="flex h-auto w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
      onClick={() => {
        if (!ready) return;
        onPick(current.systemId);
      }}
    >
      <span className="font-ui text-nav">Use current system</span>
      {ready && currentSystemName !== null ? (
        <span className="font-data text-micro text-muted">{currentSystemName}</span>
      ) : null}
      {current.kind === 'offline' ? (
        <span className="font-data text-micro text-muted">Character is offline</span>
      ) : null}
    </Button>
  );
}
