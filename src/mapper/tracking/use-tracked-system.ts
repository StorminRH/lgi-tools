'use client';

import { useMemo } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import {
  trackedSystemTarget,
  type TrackedSystemTarget,
} from './tracked-system';

const LOADING_TARGET: TrackedSystemTarget = { kind: 'loading' };

/**
 * Account-level last-known system target for this map. The tracking
 * subscription must have delivered before "untracked" is a truthful verdict.
 * Paste and persistent windows consume the result through their own policies.
 */
export function useTrackedSystemTarget(mapId: string): TrackedSystemTarget {
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  return useMemo(
    () =>
      tracking === undefined
        ? LOADING_TARGET
        : trackedSystemTarget({
            ownTrackedCharacterIds: tracking.ownTrackedCharacterIds,
            tracked: tracking.tracked,
          }),
    [tracking],
  );
}
