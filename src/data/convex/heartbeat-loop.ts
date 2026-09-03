export type HeartbeatReason = 'mount' | 'visible' | 'interval';

export interface HeartbeatHost {
  isVisible(): boolean;
  beat(reason: HeartbeatReason, visible: boolean): void;
  startInterval(tick: () => void, ms: number): () => void;
}

export interface HeartbeatLoop {
  onVisibilityChange(): void;
  stop(): void;
}

export function startHeartbeatLoop(host: HeartbeatHost, intervalMs: number): HeartbeatLoop {
  const tick = () => host.beat('interval', host.isVisible());
  let cancel = host.startInterval(tick, intervalMs);
  host.beat('mount', host.isVisible());

  return {
    onVisibilityChange() {
      if (!host.isVisible()) return;
      cancel();
      cancel = host.startInterval(tick, intervalMs);
      host.beat('visible', true);
    },
    stop() {
      cancel();
    },
  };
}
