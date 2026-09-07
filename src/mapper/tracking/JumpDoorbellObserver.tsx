'use client';

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

interface DoorbellSession {
  readonly memory: Map<number, DoorbellMemoryEntry>;
  readonly persist: () => void;
  readonly share: () => void;
  ready: boolean;
}

export function JumpDoorbellObserver({ mapId }: { readonly mapId: string }) {
  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const userId = useLiveValue(api.engine.currentUser);
  const sessionRef = useRef<DoorbellSession | null>(null);

  const ringPending = useEffectEvent(() => {
    const session = sessionRef.current;
    if (session === null || !session.ready) return;
    ringOwnDoorbells(
      session.memory,
      tracking,
      (characterId) => postJumpRequest({ kind: 'doorbell', mapId, characterId }),
      () => {
        if (sessionRef.current !== session) return;
        session.persist();
        session.share();
      },
    );
  });

  useEffect(() => {
    if (typeof userId !== 'string' || userId === '') return;
    const storageKey = JSON.stringify([userId, mapId]);
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch {}
    const memory = storage === null
      ? new Map<number, DoorbellMemoryEntry>()
      : hydrateDoorbellMemory(storage, storageKey);
    const persist = () => {
      if (storage !== null) persistDoorbellMemory(storage, storageKey, memory);
    };
    const channel = typeof BroadcastChannel === 'function'
      ? joinDoorbellChannel({
          userId,
          mapId,
          tabId: crypto.randomUUID(),
          memory,
          openChannel: (name) => new BroadcastChannel(name),
          persist,
        })
      : null;
    const session: DoorbellSession = {
      memory,
      persist,
      share: () => channel?.share(),
      ready: channel === null,
    };
    sessionRef.current = session;
    if (channel === null) ringPending();
    else void channel.ready.then(() => {
      if (sessionRef.current !== session) return;
      session.ready = true;
      ringPending();
    });
    return () => {
      persist();
      channel?.close();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [mapId, userId]);

  useEffect(() => {
    if (tracking !== undefined) ringPending();
  }, [tracking]);

  useEffect(() => {
    const id = setInterval(() => ringPending(), DOORBELL_RETRY_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
