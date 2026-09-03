'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { api } from '@/data/convex/api';
import { useLiveValue } from '@/data/convex/use-live-value';
import { postJumpRequest } from '../jump-client';
import {
  DOORBELL_RETRY_INTERVAL_MS,
  ringOwnDoorbells,
  type DoorbellMemoryEntry,
} from './doorbell-model';

export function JumpDoorbellObserver({ mapId }: { readonly mapId: string }) {

  const tracking = useLiveValue(api.mapTrackingLive.forMap, { mapId });
  const memoryRef = useRef<Map<number, DoorbellMemoryEntry> | null>(null);
  if (memoryRef.current === null) memoryRef.current = new Map();

  const ringPending = useEffectEvent(() => {
    ringOwnDoorbells(memoryRef.current, tracking, (characterId) =>
      postJumpRequest({ kind: 'doorbell', mapId, characterId }),
    );
  });

  useEffect(() => {
    if (tracking === undefined) return;
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
