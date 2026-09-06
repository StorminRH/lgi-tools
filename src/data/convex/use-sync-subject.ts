'use client';

import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';
import type { SyncDataset } from '@/lib/sync-engine';
import { api } from './api';
import { startHeartbeatSession } from './heartbeat-session';
import { postLeaveBeacon } from './leave-signal';

export function useSyncSubject(dataset: SyncDataset, characterIds: number[]) {
  const heartbeat = useMutation(api.engine.heartbeat);
  const { isAuthenticated, isLoading, isRefreshing } = useConvexAuth();
  const enabled = isAuthenticated && !isLoading && !isRefreshing;
  const currentUserId = useQuery(api.engine.currentUser, enabled ? {} : 'skip');
  const characterIdsKey = [...new Set(characterIds)].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!enabled || !currentUserId || characterIdsKey === '') return;
    const characterIdsHint = characterIdsKey.split(',').map(Number);

    const session = startHeartbeatSession(
      {
        isVisible: () => document.visibilityState === 'visible',
        now: () => performance.now(),
        createTabId: () => crypto.randomUUID(),
        openChannel: (name) => new BroadcastChannel(name),
        beat: (beat) =>
          void heartbeat({
            dataset,
            ...beat,
            expectedUserId: currentUserId,
          }).catch(() => undefined),
        leave: (tabId) => postLeaveBeacon({ dataset, tabId }),
        startInterval: (tick, ms) => {
          const id = setInterval(tick, ms);
          return () => clearInterval(id);
        },
      },
      { dataset, userId: currentUserId, characterIdsHint },
    );

    const onVisibilityChange = () => session.onVisibilityChange();
    const onPageHide = (event: PageTransitionEvent) => session.onPageHide(event);
    const onPageShow = (event: PageTransitionEvent) => session.onPageShow(event);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      session.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [dataset, characterIdsKey, heartbeat, enabled, currentUserId]);
}
