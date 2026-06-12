'use client';

// The client half of the presence-gated sync engine (3.4.9): a
// visibility-gated heartbeat. While the tab is visible, beat every
// HEARTBEAT_MS; on hide, stop (hidden-tab timers are throttled/frozen by
// browsers anyway — the server's cold window does the real teardown); on
// return, beat immediately so a stale view refreshes at once. The Convex
// subscription itself stays open throughout — only the syncing goes cold.
// Rides the existing Convex websocket: no new origin, no CSP change.
import { useMutation } from 'convex/react';
import { useCallback, useEffect } from 'react';
import { HEARTBEAT_MS, type SyncDataset } from '@/lib/sync-engine';
import { api } from './api';

export function useSyncSubject(dataset: SyncDataset, characterIds: number[]) {
  const heartbeat = useMutation(api.engine.heartbeat);

  // Key on content, not array identity — callers map fresh arrays per render.
  const characterIdsKey = characterIds.join(',');

  useEffect(() => {
    if (characterIdsKey === '') return;
    const characterIdsHint = characterIdsKey.split(',').map(Number);
    const beat = (reason: 'mount' | 'visible' | 'interval') =>
      void heartbeat({ dataset, characterIdsHint, reason });

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (reason: 'mount' | 'visible') => {
      beat(reason);
      timer = setInterval(() => beat('interval'), HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        stop();
        start('visible');
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start('mount');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dataset, characterIdsKey, heartbeat]);

  // The "Sync now" affordance: a manual beat dispatches immediately when
  // anything is stale (and after an error — an errored run clears the cache
  // window, so the click is never silently swallowed).
  return useCallback(() => {
    if (characterIdsKey === '') return;
    void heartbeat({
      dataset,
      characterIdsHint: characterIdsKey.split(',').map(Number),
      reason: 'manual',
    });
  }, [dataset, characterIdsKey, heartbeat]);
}
