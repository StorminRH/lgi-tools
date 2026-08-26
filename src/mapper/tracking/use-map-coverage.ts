'use client';

import { useState } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import {
  coverageQueryArgs,
  holdDefined,
  type CoveragePayload,
  type TrackingPayload,
} from './presence-model';

export function useMapCoverage(
  mapId: string,
  tracking: TrackingPayload | undefined,
): CoveragePayload | undefined {
  const next = useLiveValue(
    api.mapTrackingLive.coverage,
    coverageQueryArgs(mapId, tracking),
  );
  const [heldMapId, setHeldMapId] = useState(mapId);
  const [held, setHeld] = useState<CoveragePayload | undefined>(undefined);
  if (heldMapId !== mapId) {
    setHeldMapId(mapId);
    setHeld(next);
  } else if (next !== undefined && !Object.is(held, next)) {
    setHeld(next);
  }
  return holdDefined(heldMapId === mapId ? held : undefined, next);
}
