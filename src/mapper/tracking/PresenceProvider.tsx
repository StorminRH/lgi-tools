'use client';

import { useMemo, type ReactNode } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useAfkState } from './AfkGate';
import { MapPresenceContext } from './presence-context';
import { derivePresenceFromPayload } from './presence-model';
import { useMapCoverage } from './use-map-coverage';

/** Hosts presence derivation + the AFK gate for everything under the canvas shell. */
export function MapPresenceProvider({
  mapId,
  children,
}: {
  readonly mapId: string;
  readonly children: ReactNode;
}) {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const coverage = useMapCoverage(mapId, tracking);
  const afk = useAfkState();
  const presence = useMemo(
    () => derivePresenceFromPayload(tracking, coverage),
    [tracking, coverage],
  );
  const value = useMemo(() => ({ presence, afk }), [presence, afk]);

  return <MapPresenceContext value={value}>{children}</MapPresenceContext>;
}
