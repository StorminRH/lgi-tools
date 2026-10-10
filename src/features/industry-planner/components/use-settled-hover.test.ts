import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ settled: null as number | null, ref: { current: undefined as unknown }, cleanup: null as (() => void) | null }));
vi.mock('react', () => ({
  useState: () => [h.settled, (next: number | null | ((shown: number | null) => number | null)) => {
    h.settled = typeof next === 'function' ? next(h.settled) : next;
  }],
  useRef: () => h.ref,
  useEffect: (effect: () => () => void) => {
    h.cleanup = effect();
  },
  useCallback: <T>(fn: T) => fn,
}));

const { useSettledHover } = await import('./use-settled-hover');

test('passing over cards lights nothing, resting on one lights it, leaving it lets it go, and a pending light dies with the plan', () => {
  vi.useFakeTimers();
  try {
    const [, onHover] = useSettledHover();
    onHover(1, true);
    vi.advanceTimersByTime(120);
    onHover(1, false);
    onHover(2, true);
    vi.advanceTimersByTime(120);
    onHover(2, false);
    onHover(3, true);
    expect(h.settled).toBeNull();
    vi.advanceTimersByTime(260);
    expect(h.settled).toBe(3);

    // Leaving another card keeps the lit chain; leaving the lit card lets it go.
    onHover(4, false);
    expect(h.settled).toBe(3);
    onHover(3, false);
    expect(h.settled).toBeNull();

    // A light still pending when the plan goes away is dropped.
    onHover(5, true);
    h.cleanup?.();
    vi.advanceTimersByTime(500);
    expect(h.settled).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
