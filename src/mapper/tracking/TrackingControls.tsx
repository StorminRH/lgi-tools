'use client';

import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { useAccountCharacters } from '@/components/use-account-characters';
import { cn } from '@/components/ui/cn';
import {
  MenuCheckboxItem,
  menuSection,
  menuSectionLabel,
} from '@/components/ui/menu';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useMutation } from '@/data/convex/use-mutation';
import { useSyncSubject } from '@/data/convex/use-sync-subject';
import { AfkDialog } from './AfkGate';
import { useMapPresenceAfk } from './presence-context';
import {
  trackingReconnectVisible,
  trackingToggleLabel,
} from './tracking-controls-view';

interface TrackingCharacter {
  readonly characterId: number;
  readonly name: string;
  readonly portraitUrl: string;
  readonly needsLocationReconnect: boolean;
}

interface TrackingControlsViewProps {
  readonly characters: readonly TrackingCharacter[];
  readonly trackedIds: ReadonlySet<number>;
  readonly onToggle: (characterId: number, tracked: boolean) => Promise<unknown>;
  readonly reconnectAction?: ReactNode;
}

export function TrackingHeartbeat({ mapId }: { readonly mapId: string }) {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const trackedIds = tracking?.ownTrackedCharacterIds ?? [];
  const afk = useMapPresenceAfk();

  useSyncSubject('characterLocation', afk.paused ? [] : trackedIds);
  return <AfkDialog afk={afk} />;
}

export function useSetMapTracking() {
  return useMutation(api.mapTrackingOptIn.setTracking);
}

export function TrackingControls({
  mapId,
  reconnectAction,
}: {
  readonly mapId: string;
  readonly reconnectAction?: ReactNode;
}) {
  const characters = useAccountCharacters();
  const access = useLiveValue(api.mapChainAccess.watchMapAccess, { mapId });
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const setTracking = useSetMapTracking();
  const trackedIds = tracking?.ownTrackedCharacterIds ?? [];

  if (access?.granted !== true || characters === null || tracking === undefined) {
    return null;
  }

  return (
    <TrackingControlsView
      characters={characters}
      trackedIds={new Set(trackedIds)}
      onToggle={(characterId, tracked) =>
        setTracking({ mapId, characterId, tracked })
      }
      reconnectAction={reconnectAction}
    />
  );
}

function TrackingControlsView({
  characters,
  trackedIds,
  onToggle,
  reconnectAction,
}: TrackingControlsViewProps) {
  const showReconnect = trackingReconnectVisible(characters);

  return (
    <div
      data-map-tracking
      className={menuSection}
      role="group"
      aria-label="Tracking"
    >
      <div className={menuSectionLabel} aria-hidden="true">
        Tracking
      </div>
      {characters.length === 0 ? (
        <span className="px-3 pb-2 font-data text-micro text-muted">
          No linked characters
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
          {characters.map((character) => {
            const checked = trackedIds.has(character.characterId);
            return (
              <MenuCheckboxItem
                key={character.characterId}
                checked={checked}
                onCheckedChange={(next) => {
                  void onToggle(character.characterId, next);
                }}
                closeOnClick={false}
                label={character.name}
                aria-label={trackingToggleLabel({
                  name: character.name,
                  tracked: checked,
                  needsLocationReconnect: character.needsLocationReconnect,
                })}
                data-tracking-character-id={character.characterId}
                data-tracking-reconnect={
                  character.needsLocationReconnect ? 'true' : undefined
                }
                className={cn(
                  'box-border flex size-10 shrink-0 items-center justify-center rounded-full border-2 p-0.5 leading-none opacity-35 grayscale outline-none transition-[border-color,opacity,filter] data-[checked]:opacity-100 data-[checked]:grayscale-0 data-[highlighted]:ring-1 data-[highlighted]:ring-isk-sub focus-visible:ring-1 focus-visible:ring-isk-sub motion-reduce:transition-none',
                  character.needsLocationReconnect
                    ? 'border-tone-orange data-[checked]:border-tone-orange'
                    : 'border-transparent data-[checked]:border-isk',
                )}
              >
                <CharacterPortrait
                  characterId={character.characterId}
                  name={character.name}
                  size={32}
                  src={character.portraitUrl}
                  className="block"
                />
              </MenuCheckboxItem>
            );
          })}
        </div>
      )}
      {showReconnect ? (
        <div
          className="flex flex-wrap items-center gap-2 px-3 pb-2"
          data-tracking-reconnect-action
        >
          <span className="font-data text-micro text-muted">Cannot sync location</span>
          {reconnectAction}
        </div>
      ) : null}
    </div>
  );
}
