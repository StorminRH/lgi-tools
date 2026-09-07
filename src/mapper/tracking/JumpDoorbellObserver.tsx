'use client';

import { useQuery } from 'convex/react';
import { useEffect, useEffectEvent, useRef } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { postJumpRequest } from '../jump-client';
import {
  DOORBELL_RETRY_INTERVAL_MS,
  hydrateDoorbellMemory,
  joinDoorbellChannel,
  persistDoorbellMemory,
  ringOwnDoorbells,
  type DoorbellMemoryEntry,
} from './doorbell-model';

function persistMapMemory(
  mapId: string,
  memory: Map<number, DoorbellMemoryEntry>,
): void {
  persistDoorbellMemory(window.sessionStorage, mapId, memory);
}

export function JumpDoorbellObserver({ mapId }: { readonly mapId: string }) {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const userId = useQuery(api.engine.currentUser);
  const memoryRef = useRef<Map<number, DoorbellMemoryEntry> | null>(null);
  const shareRef = useRef<(() => void) | null>(null);

  const ringPending = useEffectEvent(() => {
    ringOwnDoorbells(
      memoryRef.current,
      tracking,
      (characterId) => postJumpRequest({ kind: 'doorbell', mapId, characterId }),
      () => {
        const memory = memoryRef.current;
        if (memory === null) return;
        persistMapMemory(mapId, memory);
        shareRef.current?.();
      },
    );
  });

  useEffect(() => {
    const memory = hydrateDoorbellMemory(window.sessionStorage, mapId);
    memoryRef.current = memory;
    const channel = typeof userId === 'string' && userId !== ''
      && typeof BroadcastChannel === 'function'
      ? joinDoorbellChannel({
          userId,
          mapId,
          tabId: crypto.randomUUID(),
          characterIdsHint: [],
          memory,
          openChannel: (name) => new BroadcastChannel(name),
          now: () => Date.now(),
          persist: () => persistMapMemory(mapId, memory),
        })
      : null;
    shareRef.current = channel === null ? null : () => channel.share();
    ringPending();
    return () => {
      persistMapMemory(mapId, memory);
      channel?.close();
      shareRef.current = null;
      if (memoryRef.current === memory) memoryRef.current = null;
    };
  }, [mapId, userId]);

  useEffect(() => {
    if (tracking === undefined || memoryRef.current === null) return;
    ringPending();
  }, [tracking]);

  useEffect(() => {
    const id = setInterval(() => {
      ringPending();
    }, DOORBELL_RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
