'use client';

// Rings the jump-resolver doorbell whenever the shared tracking feed shows a
// fresh transition for a tracked character. Renders nothing; the map updates
// through the ordinary chain subscriptions once the server authors. Mounted
// only for edit-capable viewers — the route would skip other ringers anyway,
// this just keeps view-only clients quiet.
import { useEffect, useEffectEvent, useRef } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { postJumpRequest } from '../jump-client';
import {
  DOORBELL_RETRY_INTERVAL_MS,
  ringOwnDoorbells,
  type DoorbellMemoryEntry,
} from './doorbell-model';

/** Watches `forMap` tracking payloads and rings the doorbell once per transition. */
export function JumpDoorbellObserver({ mapId }: { readonly mapId: string }) {
  // Shares the TrackingControls subscription: identical query + args dedupe to
  // one server subscription inside the Convex client.
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const memoryRef = useRef<Map<number, DoorbellMemoryEntry> | null>(null);
  if (memoryRef.current === null) memoryRef.current = new Map();

  // Effect Event: both drivers ring with the LATEST feed payload without
  // re-subscribing the timer. The model's synchronous in-flight marking keeps
  // a development double-invoked effect from double-ringing.
  const ringPending = useEffectEvent(() => {
    ringOwnDoorbells(memoryRef.current, tracking, (characterId) =>
      postJumpRequest({ kind: 'doorbell', mapId, characterId }),
    );
  });

  // Feed-driven ring: a fresh transition rings the moment it arrives.
  useEffect(() => {
    if (tracking === undefined) return;
    ringPending();
  }, [tracking]);

  // Timer-driven retries: the feed only updates on a location WRITE, so a
  // pilot who jumps then sits scanning produces nothing further — a transient
  // failure must re-drive from a clock. No-op ticks while nothing is pending.
  useEffect(() => {
    const id = setInterval(() => {
      ringPending();
    }, DOORBELL_RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
