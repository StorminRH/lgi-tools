'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { useAccountCharacters } from '@/components/use-account-characters';
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

interface TrackingCharacter {
  readonly characterId: number;
  readonly name: string;
  readonly portraitUrl: string;
}

interface TrackingControlsViewProps {
  readonly characters: readonly TrackingCharacter[];
  readonly trackedIds: ReadonlySet<number>;
  readonly onToggle: (characterId: number, tracked: boolean) => Promise<unknown>;
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

export function TrackingControls({ mapId }: { readonly mapId: string }) {
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
    />
  );
}

function TrackingControlsView({
  characters,
  trackedIds,
  onToggle,
}: TrackingControlsViewProps) {
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
                aria-label={`${checked ? 'Stop tracking' : 'Track'} ${character.name}`}
                data-tracking-character-id={character.characterId}

                className="box-border flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-transparent p-0.5 leading-none opacity-35 grayscale outline-none transition-[border-color,opacity,filter] data-[checked]:border-isk data-[checked]:opacity-100 data-[checked]:grayscale-0 data-[highlighted]:ring-1 data-[highlighted]:ring-isk-sub focus-visible:ring-1 focus-visible:ring-isk-sub motion-reduce:transition-none"
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
    </div>

  );
}
