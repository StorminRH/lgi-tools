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
// characterIds array and the effect tears the loop down. A tab the browser
// freezes or discards outright stops beating and goes cold at the window —
// accepted; recovery on thaw/refocus is automatic. The Convex subscription
// itself stays open throughout — only the syncing goes cold. Rides the
// existing Convex websocket: no new origin, no CSP change.
//
// Loop mechanics live in heartbeat-loop.ts (pure, node-tested); this hook is
// the thin DOM/mutation wiring per the repo's no-DOM-test-stack posture.
import { useMutation } from 'convex/react';
import { useEffect } from 'react';
import { HEARTBEAT_MS, type SyncDataset } from '@/lib/sync-engine';
import { api } from './api';
import { startHeartbeatLoop } from './heartbeat-loop';

/**
 * Keeps one dataset's sync subject alive for the given characters: mounts the
 * always-on heartbeat loop and tears it down on unmount or an empty
 * character set (the caller's pause switch).
 */
export function useSyncSubject(dataset: SyncDataset, characterIds: number[]) {
  const heartbeat = useMutation(api.engine.heartbeat);

  // Key on content, not array identity — callers map fresh arrays per render.
  const characterIdsKey = characterIds.join(',');

  useEffect(() => {
    if (characterIdsKey === '') return;
    const characterIdsHint = characterIdsKey.split(',').map(Number);

    const loop = startHeartbeatLoop(
      {
        isVisible: () => document.visibilityState === 'visible',
        beat: (reason, visible) => void heartbeat({ dataset, characterIdsHint, reason, visible }),
        startInterval: (tick, ms) => {
          const id = setInterval(tick, ms);
          return () => clearInterval(id);
        },
      },
      HEARTBEAT_MS,
    );

    const onVisibilityChange = () => loop.onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      loop.stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [dataset, characterIdsKey, heartbeat]);
}
