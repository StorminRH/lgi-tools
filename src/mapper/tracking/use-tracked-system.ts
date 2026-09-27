'use client';

import { useMemo } from 'react';
import { usePreference } from '@/components/PreferencesProvider';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { atlasDockCharacter } from '@/lib/preferences';
import { coverageIndex } from './presence-model';
import { useMapCoverage } from './use-map-coverage';
import {
  dockCharacters,
  resolveDockCharacter,
  type DockCharacterResolution,
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

export function useDockCharacter(mapId: string): DockCharacterSelection {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const coverage = useMapCoverage(mapId, tracking);
  const [pinnedCharacterId, pin] = usePreference(atlasDockCharacter);
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
  return useMemo(
    () => ({
      ...(characters === null
        ? LOADING_RESOLUTION
        : resolveDockCharacter(characters, pinnedCharacterId)),
      pin,
    }),
    [characters, pinnedCharacterId, pin],
  );
}
