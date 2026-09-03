import { describe, expect, it } from 'vitest';
import { type HeartbeatHost, startHeartbeatLoop } from './heartbeat-loop';

interface FakeTimer {
  tick: () => void;
  cancelled: boolean;
}

function makeHost(initiallyVisible: boolean) {
  const beats: Array<{ reason: string; visible: boolean }> = [];
  const timers: FakeTimer[] = [];
  let visible = initiallyVisible;
  const host: HeartbeatHost = {
    isVisible: () => visible,
    beat: (reason, beatVisible) => beats.push({ reason, visible: beatVisible }),
    startInterval: (tick) => {
      const timer: FakeTimer = { tick, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  return {
    host,
    beats,
    timers,
    setVisible(next: boolean) {
      visible = next;
    },
    fireInterval() {
      const live = timers.filter((t) => !t.cancelled);
      expect(live).toHaveLength(1);
      live[0]!.tick();
    },
  };
}

describe('startHeartbeatLoop', () => {
  it('beats on mount with the tab visibility and keeps beating on the interval', () => {
    const f = makeHost(true);
    startHeartbeatLoop(f.host, 20_000);
    expect(f.beats).toEqual([{ reason: 'mount', visible: true }]);
    f.fireInterval();
    expect(f.beats[1]).toEqual({ reason: 'interval', visible: true });
  });

  it('a hidden mount still beats — the subject row must exist for a background tab', () => {
    const f = makeHost(false);
    startHeartbeatLoop(f.host, 20_000);
    expect(f.beats).toEqual([{ reason: 'mount', visible: false }]);
  });

  it('keeps the interval running while hidden, stamping beats as hidden', () => {
    const f = makeHost(true);
    startHeartbeatLoop(f.host, 20_000);
    f.setVisible(false);
    f.fireInterval();
    f.fireInterval();
    expect(f.beats.slice(1)).toEqual([
      { reason: 'interval', visible: false },
      { reason: 'interval', visible: false },
    ]);
  });

  it('returning to visible beats immediately and re-phases the interval', () => {
    const f = makeHost(true);
    const loop = startHeartbeatLoop(f.host, 20_000);
    f.setVisible(false);
    loop.onVisibilityChange();
    expect(f.beats).toHaveLength(1);
    expect(f.timers[0]!.cancelled).toBe(false);

    f.setVisible(true);
    loop.onVisibilityChange();
    expect(f.beats[1]).toEqual({ reason: 'visible', visible: true });
    expect(f.timers[0]!.cancelled).toBe(true);
    f.fireInterval();
    expect(f.beats[2]).toEqual({ reason: 'interval', visible: true });
  });

  it('stop cancels the live timer, including one created by a re-phase', () => {
    const f = makeHost(true);
    const loop = startHeartbeatLoop(f.host, 20_000);
    loop.onVisibilityChange();
    loop.stop();
    expect(f.timers.every((t) => t.cancelled)).toBe(true);
  });
});
