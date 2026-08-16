'use client';

// The client half of the presence-gated sync engine (3.4.9): an always-on
// heartbeat. The interval keeps running while the tab is HIDDEN — hidden-tab
// beats arrive browser-throttled (~1/min worst case, Chrome's intensive
// throttling; see heartbeat-loop.ts for the per-engine reality) and each
// dataset's server-side coldAfterMs absorbs that, which is what lets Atlas
// tracking survive being alt-tabbed behind the game client. Every beat
// carries its tab visibility so the server can hold the hidden-presence
// backstop; a return to visible beats immediately so a stale view refreshes
// at once. Pausing (the AFK gate) is caller-owned: pass an empty
// characterIds array and the effect tears the loop down. A real tab close
// fires pagehide (not visibilitychange-hidden) and a same-origin leave
// beacon so ESI stops without waiting for coldAfterMs. Crash / force-quit
// still go cold at the window. The Convex subscription itself stays open
// throughout — only the syncing goes cold. Beats ride the Convex websocket;
// leave uses sendBeacon because that socket is dying.
//
// Loop mechanics live in heartbeat-loop.ts (pure, node-tested); this hook is
// the thin DOM/mutation wiring per the repo's no-DOM-test-stack posture.
import { useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';
import { HEARTBEAT_MS, type SyncDataset } from '@/lib/sync-engine';
import { api } from './api';
import { startHeartbeatLoop } from './heartbeat-loop';
import { postLeaveBeacon, shouldSendLeave } from './leave-signal';

/**
 * Keeps one dataset's sync subject alive for the given characters: mounts the
 * always-on heartbeat loop, stamps a per-tab id on each beat, and tears down
 * on unmount or an empty character set (the caller's pause switch).
 */
export function useSyncSubject(dataset: SyncDataset, characterIds: number[]) {
  const heartbeat = useMutation(api.engine.heartbeat);
  const tabIdRef = useRef<string | null>(null);
  if (tabIdRef.current === null) {
    tabIdRef.current = crypto.randomUUID();
  }

  // Key on content, not array identity — callers map fresh arrays per render.
  const characterIdsKey = characterIds.join(',');

  useEffect(() => {
    if (characterIdsKey === '') return;
    const characterIdsHint = characterIdsKey.split(',').map(Number);
    const tabId = tabIdRef.current;
    if (tabId === null) return;

    const loop = startHeartbeatLoop(
      {
        isVisible: () => document.visibilityState === 'visible',
        // Fire-and-forget by design: a rejected beat (deploy blip, auth
        // refresh) is recovered by the next beat; swallow the rejection so a
        // hidden tab can't accumulate unhandled-rejection noise.
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
