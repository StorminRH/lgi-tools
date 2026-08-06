'use client';

// Rings the jump-resolver doorbell whenever the shared tracking feed shows a
// fresh transition for a tracked character. Renders nothing; the map updates
// through the ordinary chain subscriptions once the server authors. Mounted
// only for edit-capable viewers — the route would skip other ringers anyway,
// this just keeps view-only clients quiet.
import { useEffect, useRef } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { postJumpRequest } from '../jump-client';
import {
  ringPendingTransitions,
  type DoorbellMemoryEntry,
} from './doorbell-model';

/** Watches `forMap` tracking payloads and rings the doorbell once per transition. */
export function JumpDoorbellObserver({ mapId }: { readonly mapId: string }) {
  // Shares the TrackingControls subscription: identical query + args dedupe to
  // one server subscription inside the Convex client.
  const tracking = useLiveValue(api.mapTracking.forMap, { mapId });
  const memoryRef = useRef<Map<number, DoorbellMemoryEntry> | null>(null);
  if (memoryRef.current === null) memoryRef.current = new Map();

  useEffect(() => {
    const memory = memoryRef.current;
    const tracked = tracking?.tracked;
    if (memory === null || tracked === undefined) return;
    void ringPendingTransitions(memory, tracked, (characterId) =>
      postJumpRequest({ kind: 'doorbell', mapId, characterId }),
    );
  }, [tracking, mapId]);

  return null;
}
