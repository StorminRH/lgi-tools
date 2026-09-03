'use client';

import { useMemo } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { coverageIndex } from './presence-model';
import { useMapCoverage } from './use-map-coverage';
import {
  trackedSystemTarget,
  type TrackedSystemTarget,
} from './tracked-system';

const LOADING_TARGET: TrackedSystemTarget = { kind: 'loading' };

export function useTrackedSystemTarget(mapId: string): TrackedSystemTarget {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const coverage = useMapCoverage(mapId, tracking);
  return useMemo(
    () =>
      tracking === undefined || coverage === undefined
        ? LOADING_TARGET
        : trackedSystemTarget({
            ownTrackedCharacterIds: tracking.ownTrackedCharacterIds,
            tracked: tracking.tracked,
            coverage: coverageIndex(coverage),
          }),
    [tracking, coverage],
  );
}
