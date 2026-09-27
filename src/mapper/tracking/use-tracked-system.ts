'use client';

import { useMemo } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { atlasDockCharacter, atlasScannerCharacter } from '@/lib/preferences';
import { coverageIndex } from './presence-model';
import { useMapCoverage } from './use-map-coverage';
import {
  dockCharacters,
  resolveDockCharacter,
  resolvePasteTarget,
  type DockCharacterResolution,
  type PasteTarget,
} from './tracked-system';

const LOADING_RESOLUTION: DockCharacterResolution = {
  target: { kind: 'loading' },
  mode: 'auto',
  pinnedCharacterId: null,
  characters: [],
};

export interface DockCharacterSelection extends DockCharacterResolution {
  /** Pins a character, or returns to Auto with null. */
  readonly pin: (characterId: number | null) => void;
}

export interface TrackedCharacterTargets {
  readonly dock: DockCharacterSelection;
  readonly paste: PasteTarget;
  /** Sets the default scanner, or clears it with null. */
  readonly setScanner: (characterId: number | null) => void;
}

export function useTrackedCharacterTargets(mapId: string): TrackedCharacterTargets {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const coverage = useMapCoverage(mapId, tracking);
  const [pinnedCharacterId, pin] = usePreference(atlasDockCharacter);
  const [scannerCharacterId, setScanner] = usePreference(atlasScannerCharacter);
  const characters = useMemo(
    () =>
      tracking === undefined || coverage === undefined
        ? null
        : dockCharacters({
            ownTrackedCharacterIds: tracking.ownTrackedCharacterIds,
            tracked: tracking.tracked,
            coverage: coverageIndex(coverage),
          }),
    [tracking, coverage],
  );
  const dock = useMemo(
    () => ({
      ...(characters === null
        ? LOADING_RESOLUTION
        : resolveDockCharacter(characters, pinnedCharacterId)),
      pin,
    }),
    [characters, pinnedCharacterId, pin],
  );
  const paste = useMemo(
    () => resolvePasteTarget(characters, scannerCharacterId),
    [characters, scannerCharacterId],
  );
  return { dock, paste, setScanner };
}
