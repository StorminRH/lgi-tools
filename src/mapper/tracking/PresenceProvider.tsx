'use client';

// The presence host for one map: the single place the tracked-location
// subscription becomes derived per-system presence for the frame badges and
// the intelligence body. Reads the SAME `mapTracking.forMap` subscription the
// tracking controls and doorbell use (identical query + args dedupe to one
// server subscription inside the Convex client).
//
// The AFK gate's state machine lives here too, one level above the heartbeat:
// presence needs the gate's verdict for the own-character `AFK` status word,
// and the heartbeat needs the same instance's pause switch, so a single owner
// provides both.
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
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const afk = useAfkState();

  // The prompt itself is the honest local AFK signal: it is up because the
  // pilot has been continuously hidden past the threshold, whether or not the
  // pause has landed yet.
  const ownAfk = afk.promptOpen;
  const presence = useMemo(
    () => derivePresenceFromPayload(tracking, ownAfk),
    [tracking, ownAfk],
  );
  const value = useMemo(() => ({ presence, afk }), [presence, afk]);

  return <MapPresenceContext value={value}>{children}</MapPresenceContext>;
}
