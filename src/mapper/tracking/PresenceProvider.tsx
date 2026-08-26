'use client';

// The presence host for one map: the single place the tracked-location
// subscription becomes derived per-system presence for the frame badges and
// the intelligence body. Reads the SAME `forMap` subscription the
// tracking controls and doorbell use, plus the flip-only `coverage` sibling
// so a pin hide does not invalidate the location overlay.
//
// The AFK gate's state machine lives here too, one level above the heartbeat:
// the heartbeat needs the gate's pause switch, so a single owner provides both.
import { useMemo, type ReactNode } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useAfkState } from './AfkGate';
import { MapPresenceContext } from './presence-context';
import { derivePresenceFromPayload } from './presence-model';

/** Hosts presence derivation + the AFK gate for everything under the canvas shell. */
export function MapPresenceProvider({
  mapId,
  children,
}: {
  readonly mapId: string;
  readonly children: ReactNode;
}) {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const coverage = useLiveValue(api.mapTrackingLive.coverage, { mapId });
  const afk = useAfkState();
  const presence = useMemo(
    () => derivePresenceFromPayload(tracking, coverage),
    [tracking, coverage],
  );
  const value = useMemo(() => ({ presence, afk }), [presence, afk]);

  return <MapPresenceContext value={value}>{children}</MapPresenceContext>;
}
