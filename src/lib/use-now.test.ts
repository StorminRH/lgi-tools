import { expect, test, vi } from 'vitest';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);

import { useNow } from './use-now';

test('an always-on clock reads the time at mount, refreshes once per interval, and stops when it unmounts', () => {
  rt.unmount();
  vi.useFakeTimers({ now: 5_000 });
  try {
    expect(rt.render(useNow, 30_000)).toBe(5_000);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(29_999);
    expect(rt.render(useNow, 30_000)).toBe(5_000);
    vi.advanceTimersByTime(1);
    expect(rt.render(useNow, 30_000)).toBe(35_000);
    vi.advanceTimersByTime(30_000);
    expect(rt.render(useNow, 30_000)).toBe(65_000);
    expect(vi.getTimerCount()).toBe(1);

    // A new period replaces the timer, so the next refresh is a full new period away.
    vi.advanceTimersByTime(10_000);
    expect(rt.render(useNow, 60_000)).toBe(65_000);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(59_999);
    expect(rt.render(useNow, 60_000)).toBe(65_000);
    vi.advanceTimersByTime(1);
    expect(rt.render(useNow, 60_000)).toBe(135_000);

    rt.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test('a clock gated off keeps its last reading, and a full interval passes after it turns on before it refreshes', () => {
  rt.unmount();
  vi.useFakeTimers({ now: 0 });
  try {
    expect(rt.render(useNow, 60_000, false)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(rt.render(useNow, 60_000, false)).toBe(0);

    expect(rt.render(useNow, 60_000, true)).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(59_999);
    expect(rt.render(useNow, 60_000, true)).toBe(0);
    vi.advanceTimersByTime(1);
    expect(rt.render(useNow, 60_000, true)).toBe(180_000);

    expect(rt.render(useNow, 60_000, false)).toBe(180_000);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(600_000);
    expect(rt.render(useNow, 60_000, false)).toBe(180_000);
  } finally {
    vi.useRealTimers();
  }
});

test('a predicate gate is asked about each reading and stops the clock at the first one it turns down', () => {
  rt.unmount();
  vi.useFakeTimers({ now: 0 });
  try {
    // Like a connection that is dying until it is purged at 150s.
    const dying = vi.fn((now: number) => now < 150_000);
    const tick = () => rt.render(useNow, 60_000, dying);

    expect(tick()).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(tick()).toBe(60_000);
    vi.advanceTimersByTime(60_000);
    expect(tick()).toBe(120_000);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(60_000);
    expect(tick()).toBe(180_000);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(600_000);
    expect(tick()).toBe(180_000);
    expect(dying.mock.calls.map(([now]) => now)).toEqual([0, 60_000, 120_000, 180_000, 180_000]);
  } finally {
    vi.useRealTimers();
  }
});
