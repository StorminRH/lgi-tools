// The heartbeat loop's pure core (host-injected, node-testable — the house
// pattern for DOM-adjacent logic while the repo has no DOM test stack; see
// live-price.test.ts for the precedent). The hook in use-sync-subject.ts owns
// the real document/timer wiring and stays a thin shell.
//
// One always-on interval, visible or hidden. Hidden-tab beats arrive
// browser-throttled — Chrome intensively throttles a loaded hidden tab's
// chained timers to ~1/min starting ~60s after hide (Firefox with the Convex
// websocket open and Safari stay ~20s) — and each dataset's server-side
// coldAfterMs is sized to absorb that. A tab frozen or discarded by the
// browser (battery saver, memory pressure) stops beating entirely and the
// subject goes cold at the window; on thaw one queued tick fires and the
// visible transition beats immediately, so recovery is automatic.

/** What one beat tells the server. */
export type HeartbeatReason = 'mount' | 'visible' | 'interval';

/** The injected seam: real DOM/timer/mutation in production, fakes in tests. */
export interface HeartbeatHost {
  isVisible(): boolean;
  beat(reason: HeartbeatReason, visible: boolean): void;
  /** Starts a repeating timer; returns its canceller. */
  startInterval(tick: () => void, ms: number): () => void;
}

/** A running loop's control surface. */
export interface HeartbeatLoop {
  /** Wire to visibilitychange: a return to visible beats at once and re-phases the timer. */
  onVisibilityChange(): void;
  stop(): void;
}

/**
 * Starts beating immediately (mount beat fires even when the tab mounts
 * hidden — that first beat is what creates the engine's subject row) and
 * keeps beating on the interval until stopped. Callers pause the loop by
 * unmounting/re-running the owning effect, not through this surface.
 */
export function startHeartbeatLoop(host: HeartbeatHost, intervalMs: number): HeartbeatLoop {
  const tick = () => host.beat('interval', host.isVisible());
  let cancel = host.startInterval(tick, intervalMs);
  host.beat('mount', host.isVisible());

  return {
    onVisibilityChange() {
      if (!host.isVisible()) return;
      // Back from the game: beat NOW so a stale view refreshes at once, and
      // re-phase the interval so the next beat is a full period out.
      cancel();
      cancel = host.startInterval(tick, intervalMs);
      host.beat('visible', true);
    },
    stop() {
      cancel();
    },
  };
}
