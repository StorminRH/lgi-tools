'use client';

import { useId, useRef } from 'react';
import { useActiveCharacterId } from '@/components/use-account-characters';
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
import { useSetMapTracking } from '../tracking/TrackingControls';
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
 * `canEdit` and a complete empty systems page.
 */
export function HomePrompt({ mapId, onPick }: HomePromptProps) {
  const { parse, suggest } = useSystemSearch();
  const titleId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const characterId = useActiveCharacterId();
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const freshness = useLiveValue(api.mapTracking.feedFreshness, { mapId });
  const setTracking = useSetMapTracking();
  const current = homeCurrentSystem({ characterId, tracking, freshness });
  const currentSystemId = current.kind === 'ready' ? current.systemId : null;
  const currentSystemName = useSystemName(currentSystemId);

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
