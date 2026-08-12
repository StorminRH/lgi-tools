'use client';

// The map's per-character tracking opt-in. The visible portrait controls live
// in the account portrait menu below page-settings Map settings; TrackingHeartbeat
// stays mounted with the canvas so syncing never depends on whether that popup
// is open. The roster comes from the existing account-character owner; committed
// toggle state comes from Convex forMap. No location state is mirrored locally
// and no new polling path exists here.
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

/**
 * Keeps location syncing alive for the caller-owned characters tracked on this map. This owner stays
 * mounted with the accessible canvas rather than with the account-menu popup. The AFK gate's state
 * machine lives one level up in MapPresenceProvider (presence renders its verdict too); this owner
 * consumes the same instance: an unanswered hour-hidden prompt empties the character set (the pause
 * switch), and dismissing the waiting dialog resumes syncing with an immediate mount beat.
 */
export function TrackingHeartbeat({ mapId }: { readonly mapId: string }) {
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const trackedIds = tracking?.ownTrackedCharacterIds ?? [];
  const afk = useMapPresenceAfk();

  useSyncSubject('characterLocation', afk.paused ? [] : trackedIds);
  return <AfkDialog afk={afk} />;
}

/** Client mutation for this map's per-character tracking opt-in. */
export function useSetMapTracking() {
  return useMutation(api.mapTracking.setTracking);
}

/** Lists the signed-in pilot's linked characters as map-menu tracking controls. */
export function TrackingControls({ mapId }: { readonly mapId: string }) {
  const characters = useAccountCharacters();
  const access = useLiveValue(api.mapChain.watchMapAccess, { mapId });
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
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
                // Fixed square hit target: content-sized CheckboxItem + inline-block
                // portrait baseline gap was stretching height and ovalizing the ring.
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
