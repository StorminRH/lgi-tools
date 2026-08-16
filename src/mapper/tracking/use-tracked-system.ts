'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { feedFreshnessIndex } from './presence-model';
import {
  trackedSystemTarget,
  type TrackedSystemTarget,
} from './tracked-system';

const LOADING_TARGET: TrackedSystemTarget = { kind: 'loading' };
const PRESENCE_TICK_MS = 30_000;

/**
 * Account-level live-system target for this map. Both tracking subscriptions
 * must have delivered before "untracked" is a truthful verdict. Paste and
 * persistent windows consume the result through their own policies.
 */
export function useTrackedSystemTarget(mapId: string): TrackedSystemTarget {
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const freshness = useLiveValue(api.mapTracking.feedFreshness, { mapId });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PRESENCE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return useMemo(
    () =>
      tracking === undefined || freshness === undefined
        ? LOADING_TARGET
        : trackedSystemTarget({
            ownTrackedCharacterIds: tracking.ownTrackedCharacterIds,
            tracked: tracking.tracked,
            freshness: feedFreshnessIndex(freshness),
            now,
          }),
    [tracking, freshness, now],
  );
}
