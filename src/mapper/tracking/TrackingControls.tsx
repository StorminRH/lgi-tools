'use client';

import type { ReactNode } from 'react';
import { CharacterPortraitMenuItems } from '@/components/character-portrait-picker';
import { useAccountCharacters } from '@/components/use-account-characters';
import { usePreference } from '@/components/PreferencesProvider';
import { MenuGroup, menuControlRow } from '@/components/ui/menu';
import { toast } from '@/components/ui/toast';
import { Select } from '@/components/ui/select';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useMutation } from '@/data/convex/use-mutation';
import { useSyncSubject } from '@/data/convex/use-sync-subject';
import { readConvexError } from '@/lib/convex-error';
import { atlasScannerCharacter } from '@/lib/preferences';
import { AfkDialog, useAfkState } from './AfkGate';
import {
  SCANNER_ASK_VALUE,
  scannerSelectValue,
  trackableCharacters,
  trackingToggleLabel,
} from './tracking-controls-view';

const trackingRowClass = 'flex flex-wrap items-center gap-2 px-3 pb-2';

interface TrackingCharacter {
  readonly characterId: number;
  readonly name: string;
  readonly portraitUrl: string;
  readonly needsLocationReconnect: boolean;
}

interface TrackingControlsViewProps {
  readonly characters: readonly TrackingCharacter[];
  readonly scannerCharacters: readonly TrackingCharacter[];
  readonly emptyLabel: string;
  readonly trackedIds: ReadonlySet<number>;
  readonly onToggle: (characterId: number, tracked: boolean) => Promise<void>;
  readonly reconnectAction: ReactNode;
}

export function TrackingHeartbeat({ mapId }: { readonly mapId: string }) {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const trackedIds = tracking?.ownTrackedCharacterIds ?? [];
  const afk = useAfkState();

  useSyncSubject('characterLocation', afk.paused ? [] : trackedIds);
  return <AfkDialog afk={afk} />;
}

/**
 * Opt a character into or out of tracking on one map. The returned function
 * never rejects: a refusal toasts the server's detail, which setTracking
 * writes for users, or asks the user to try again when there is none.
 */
export function useSetMapTracking(): (args: {
  readonly mapId: string;
  readonly characterId: number;
  readonly tracked: boolean;
}) => Promise<void> {
  const setTracking = useMutation(api.mapTrackingOptIn.setTracking);
  return async (args) => {
    try {
      await setTracking(args);
    } catch (error) {
      toast.error('Tracking was not changed', {
        description: readConvexError(error)?.detail ?? 'Please try again.',
      });
    }
  };
}

export function TrackingControls({
  mapId,
  reconnectAction,
}: {
  readonly mapId: string;
  readonly reconnectAction: ReactNode;
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
      characters={trackableCharacters(characters, access.trackableCharacterIds ?? null)}
      scannerCharacters={characters}
      emptyLabel={(access.trackableCharacterIds ?? null) === null
        ? 'No linked characters'
        : 'None of your characters are on this map\'s access list'}
      trackedIds={new Set(trackedIds)}
      onToggle={(characterId, tracked) => setTracking({ mapId, characterId, tracked })}
      reconnectAction={reconnectAction}
    />
  );
}

function TrackingControlsView({
  characters,
  scannerCharacters,
  emptyLabel,
  trackedIds,
  onToggle,
  reconnectAction,
}: TrackingControlsViewProps) {
  const showReconnect = characters.some((character) => character.needsLocationReconnect);

  return (
    <MenuGroup data-map-tracking label="Tracking">
      {characters.length === 0 ? (
        <span className="px-3 pb-2 font-data text-micro text-muted">{emptyLabel}</span>
      ) : (
        <CharacterPortraitMenuItems
          className={trackingRowClass}
          characters={characters}
          checkedIds={trackedIds}
          onToggle={({ characterId, selected }) => {
            void onToggle(characterId, selected);
          }}
          itemLabel={(character, checked) => trackingToggleLabel({
            name: character.name,
            tracked: checked,
            needsLocationReconnect: character.needsLocationReconnect === true,
          })}
        />
      )}
      {scannerCharacters.length > 1 ? <DefaultScannerRow characters={scannerCharacters} /> : null}
      {showReconnect ? (
        <div className={trackingRowClass} data-tracking-reconnect-action>
          <span className="font-ui text-ui text-muted">Cannot sync location</span>
          {reconnectAction}
        </div>
      ) : null}
    </MenuGroup>
  );
}

function DefaultScannerRow({
  characters,
}: {
  readonly characters: readonly TrackingCharacter[];
}) {
  const [scannerCharacterId, setScanner] = usePreference(atlasScannerCharacter);
  return (
    <div data-default-scanner className={menuControlRow}>
      <span className="whitespace-nowrap">Default scanner</span>
      <Select
        ariaLabel="Default scanner"
        size="sm"
        className="w-36 min-w-0"
        value={scannerSelectValue(scannerCharacterId, characters)}
        onValueChange={(value) =>
          setScanner(value === SCANNER_ASK_VALUE ? null : Number(value))
        }
        items={[
          { value: SCANNER_ASK_VALUE, label: 'Ask when unclear' },
          ...characters.map((character) => ({
            value: String(character.characterId),
            label: character.name,
          })),
        ]}
      />
    </div>
  );
}
