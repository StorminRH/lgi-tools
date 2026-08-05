'use client';

// The map's per-character tracking opt-in. The roster comes from the existing
// account-character owner; committed toggle state comes from Convex forMap; the
// heartbeat follows only the caller-owned ids returned by that query. No
// location state is mirrored locally and no new polling path exists here.
import { Panel } from '@xyflow/react';
import { useAccountCharacters } from '@/components/use-account-characters';
import { cn } from '@/components/ui/cn';
import { Switch } from '@/components/ui/switch';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useMutation } from '@/data/convex/use-mutation';
import { useSyncSubject } from '@/data/convex/use-sync-subject';
import { mapFrostedSurface } from '../map-frosted-surface';

interface TrackingCharacter {
  readonly characterId: number;
  readonly name: string;
}

interface TrackingControlsViewProps {
  readonly characters: readonly TrackingCharacter[];
  readonly trackedIds: ReadonlySet<number>;
  readonly onToggle: (characterId: number, tracked: boolean) => Promise<unknown>;
}

/**
 * Lists the signed-in pilot's linked characters and controls tracking on the
 * current map. Must mount inside the mapper's React Flow provider.
 */
export function TrackingControls({ mapId }: { readonly mapId: string }) {
  const characters = useAccountCharacters();
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const setTracking = useMutation(api.mapTracking.setTracking);
  const trackedIds = tracking?.ownTrackedCharacterIds ?? [];

  useSyncSubject('characterLocation', trackedIds);

  if (characters === null || tracking === undefined) return null;

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
    <Panel
      position="top-left"
      data-map-tracking
      className={cn(
        'nopan nodrag nowheel mx-2! mb-2! mt-4! flex w-56 flex-col gap-2 rounded-card p-2 text-ui',
        mapFrostedSurface,
      )}
    >
      <span className="text-label uppercase tracking-label text-muted">
        Live tracking
      </span>
      {characters.length === 0 ? (
        <span className="font-data text-micro text-muted">
          No linked characters
        </span>
      ) : (
        characters.map((character) => {
          const checked = trackedIds.has(character.characterId);
          return (
            <div
              key={character.characterId}
              className="flex items-center justify-between gap-2"
            >
              <span className="min-w-0 truncate text-nav text-name">
                {character.name}
              </span>
              <Switch
                checked={checked}
                onCheckedChange={async (next) => {
                  await onToggle(character.characterId, next);
                }}
                label={`${checked ? 'Stop tracking' : 'Track'} ${character.name}`}
                tone="neutral"
              />
            </div>
          );
        })
      )}
    </Panel>
  );
}
