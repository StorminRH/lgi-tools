'use client';

import { useId, useRef } from 'react';
import {
  CharacterPortraitPicker,
  type PickerCharacter,
} from '@/components/character-portrait-picker';
import {
  useAccountCharacters,
  useActiveCharacterId,
} from '@/components/use-account-characters';
import { Button } from '@/components/ui/button';
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
import { useMapTrackingToggle } from '../tracking/TrackingControls';
import { trackableCharacters, trackingToggleLabel } from '../tracking/tracking-controls-view';
import { useMapCoverage } from '../tracking/use-map-coverage';
import { homeCurrentSystem, type HomeCurrentSystem } from './home-prompt-model';

export interface HomePromptProps {
  readonly mapId: string;
  readonly onPick: (systemId: number) => void;
}

export function HomePrompt({ mapId, onPick }: HomePromptProps) {
  const { parse, suggest } = useSystemSearch();
  const titleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const characterId = useActiveCharacterId();
  const characters = useAccountCharacters();
  const access = useLiveValue(api.mapChainAccess.watchMapAccess, { mapId });
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const coverage = useMapCoverage(mapId, tracking);
  const toggleTracking = useMapTrackingToggle(mapId);
  const current = homeCurrentSystem({ characterId, tracking, coverage });
  const currentSystemId = current.kind === 'ready' ? current.systemId : null;
  const currentSystemName = useSystemName(currentSystemId);
  // Wait for access and tracking, as TrackingControls does, so a scoped map
  // never flashes the whole roster and no portrait flips once tracking loads.
  const trackable = access?.granted === true && characters !== null && tracking !== undefined
    ? trackableCharacters(characters, access.trackableCharacterIds)
    : [];

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
        <HomeTrackingToggles
          characters={trackable}
          trackedIds={new Set(tracking?.ownTrackedCharacterIds)}
          onToggle={toggleTracking}
        />
        <CurrentSystemControl
          current={current}
          currentSystemName={currentSystemName}
          onPick={onPick}
          onStartTracking={() => {
            if (characterId === null) return;
            void toggleTracking(characterId, true);
          }}
        />
      </div>
    </Dialog>
  );
}

function HomeTrackingToggles({
  characters,
  trackedIds,
  onToggle,
}: {
  readonly characters: readonly PickerCharacter[];
  readonly trackedIds: ReadonlySet<number>;
  readonly onToggle: (characterId: number, tracked: boolean) => Promise<void>;
}) {
  if (characters.length === 0) return null;
  return (
    <div data-map-home-tracking className="flex flex-col gap-2">
      <span className="font-ui text-micro text-muted">Track a character in space</span>
      <CharacterPortraitPicker
        label="Tracking"
        characters={characters}
        selectedIds={trackedIds}
        onToggle={({ characterId, selected }) => {
          void onToggle(characterId, selected);
        }}
        itemLabel={trackingToggleLabel}
        markLocationReconnect
      />
    </div>
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
