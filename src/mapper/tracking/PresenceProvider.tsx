'use client';

// The presence host for one map: the single place the tracked-location
// subscription becomes derived per-system presence for the frame badges and
// the intelligence body. Reads the SAME `mapTracking.forMap` subscription the
// tracking controls and doorbell use, plus the tiny `feedFreshness` sibling —
// the split keeps the hot per-run subject stamp out of `forMap`'s read set.
//
// The AFK gate's state machine lives here too, one level above the heartbeat:
// the heartbeat needs the gate's pause switch, so a single owner provides
// both. A coarse 30s tick hides pilots whose coverage stamp has aged out
// after they closed Atlas or the feed paused.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { useAfkState } from './AfkGate';
import { MapPresenceContext } from './presence-context';
import { derivePresenceFromPayload } from './presence-model';

/** Coarse present/absent re-evaluation cadence; payload changes re-derive at once. */
const PRESENCE_TICK_MS = 30_000;

/** Hosts presence derivation + the AFK gate for everything under the canvas shell. */
export function MapPresenceProvider({
  mapId,
  children,
}: {
  readonly mapId: string;
  readonly children: ReactNode;
}) {
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const freshness = useLiveValue(api.mapTracking.feedFreshness, { mapId });
  const afk = useAfkState();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PRESENCE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const presence = useMemo(
    () => derivePresenceFromPayload(tracking, freshness, now),
    [tracking, freshness, now],
  );
  const value = useMemo(() => ({ presence, afk }), [presence, afk]);

  return <MapPresenceContext value={value}>{children}</MapPresenceContext>;
}
