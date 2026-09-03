'use client';

import { useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';
import { HEARTBEAT_MS, type SyncDataset } from '@/lib/sync-engine';
import { api } from './api';
import { startHeartbeatLoop } from './heartbeat-loop';
import { postLeaveBeacon, shouldSendLeave } from './leave-signal';

export function useSyncSubject(dataset: SyncDataset, characterIds: number[]) {
  const heartbeat = useMutation(api.engine.heartbeat);
  const tabIdRef = useRef<string | null>(null);
  if (tabIdRef.current === null) {
    tabIdRef.current = crypto.randomUUID();
  }

  const characterIdsKey = characterIds.join(',');

  useEffect(() => {
    if (characterIdsKey === '') return;
    const characterIdsHint = characterIdsKey.split(',').map(Number);
    const tabId = tabIdRef.current;
    if (tabId === null) return;

    const loop = startHeartbeatLoop(
      {
        isVisible: () => document.visibilityState === 'visible',
        beat: (reason, visible) =>
          void heartbeat({
            dataset,
            characterIdsHint,
            reason,
            visible,
            tabId,
          }).catch(() => undefined),
        startInterval: (tick, ms) => {
          const id = setInterval(tick, ms);
          return () => clearInterval(id);
        },
      },
      HEARTBEAT_MS,
    );

    const onVisibilityChange = () => loop.onVisibilityChange();
    const onPageHide = (event: PageTransitionEvent) => {
      if (!shouldSendLeave(event)) return;
      postLeaveBeacon({ dataset, tabId });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      loop.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [dataset, characterIdsKey, heartbeat]);
}
