import { describe, expect, it } from 'vitest';
import { listenForAtlasReturn } from './atlas-return-refresh';

function returnEvents() {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const window = new EventTarget();
  let now = 0;
  let pending = false;
  let checks = 0;
  const stop = listenForAtlasReturn({
    document,
    window,
    now: () => now,
    refresh: () => {
      if (pending) return false;
      checks++;
      return true;
    },
  });
  return {
    document,
    window,
    stop,
    checks: () => checks,
    advance: (ms: number) => { now += ms; },
    pending: (value: boolean) => { pending = value; },
    show: (persisted: boolean) => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));
    },
  };
}

describe('Atlas return refresh', () => {
  it('checks a visible return once across overlapping visibility, focus, and restoration events', () => {
    const events = returnEvents();
    events.window.dispatchEvent(new Event('focus'));
    events.advance(6_000);
    events.document.visibilityState = 'hidden';
    events.document.dispatchEvent(new Event('visibilitychange'));
    events.window.dispatchEvent(new Event('focus'));
    events.show(true);
    expect(events.checks()).toBe(0);

    events.document.visibilityState = 'visible';
    events.document.dispatchEvent(new Event('visibilitychange'));
    events.window.dispatchEvent(new Event('focus'));
    events.show(true);
    expect(events.checks()).toBe(1);

    events.advance(6_000);
    events.window.dispatchEvent(new Event('focus'));
    expect(events.checks()).toBe(2);
    events.stop();
  });

  it('checks browser restoration without tracking and ignores ordinary page-show events', () => {
    const events = returnEvents();
    events.advance(6_000);
    events.show(false);
    expect(events.checks()).toBe(0);
    events.show(true);
    expect(events.checks()).toBe(1);
    events.advance(60_000);
    expect(events.checks()).toBe(1);
    events.stop();
    events.show(true);
    events.window.dispatchEvent(new Event('focus'));
    events.document.dispatchEvent(new Event('visibilitychange'));
    expect(events.checks()).toBe(1);
  });

  it('allows the next return after a pending refresh finishes', () => {
    const events = returnEvents();
    events.advance(6_000);
    events.pending(true);
    events.window.dispatchEvent(new Event('focus'));
    events.pending(false);
    events.window.dispatchEvent(new Event('focus'));
    expect(events.checks()).toBe(1);
    events.stop();
  });
});
