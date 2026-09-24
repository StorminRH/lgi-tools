import { afterEach, expect, test, vi } from 'vitest';
import { createWormholeHost } from './host';
import { WORMHOLE_IMPULSE_SETTLE_S } from './motion';
import { wormholePalette } from './palette';
import type { WormholePaint } from './painter';

const { paint, release } = vi.hoisted(() => ({
  paint: vi.fn<(target: unknown, input: WormholePaint) => boolean>(() => true),
  release: vi.fn(),
}));
vi.mock('./painter', () => ({ acquireWormholePainter: () => ({ paint, release }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function browser() {
  let now = 0;
  let next = 0;
  let timeout = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timeouts = new Map<number, () => void>();
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
  let preference: () => void = () => {};
  let visibility: () => void = () => {};
  const disconnect = vi.fn();
  const media = { matches: false, addEventListener: (_: string, fn: () => void) => { preference = fn; }, removeEventListener: vi.fn() };
  const doc = { hidden: false, addEventListener: (_: string, fn: () => void) => { visibility = fn; }, removeEventListener: vi.fn() };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('window', {
    devicePixelRatio: 2, matchMedia: () => media,
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++next, fn); return next; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
    setTimeout: (fn: () => void) => { timeouts.set(++timeout, fn); return timeout; },
    clearTimeout: (id: number) => { timeouts.delete(id); },
  });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(fn: typeof intersect) { intersect = fn; }
    observe() {}
    disconnect = disconnect;
  });
  const context = { clearRect: vi.fn() };
  const setProperty = vi.fn();
  const canvas = { width: 0, height: 0, dataset: {}, parentElement: { style: { setProperty } }, getContext: () => context } as unknown as HTMLCanvasElement;
  return {
    canvas, frames, context, media, doc, disconnect, setProperty,
    visible: (yes: boolean) => intersect([{ isIntersecting: yes }]),
    visibleBatch: (states: boolean[]) => intersect(states.map((isIntersecting) => ({ isIntersecting }))),
    preference: () => preference(), visibility: () => visibility(),
    advance(seconds: number) {
      for (let i = 0; i < seconds * 60; i += 1) {
        now += 1000 / 60;
        const pending = [...frames.values()]; frames.clear();
        pending.forEach((fn) => fn(now));
      }
    },
    recover() {
      const pending = [...timeouts.values()]; timeouts.clear();
      pending.forEach((fn) => fn());
    },
  };
}

test('lazy visibility, palette updates, impulse settling and idle stop work together', () => {
  const env = browser();
  const host = createWormholeHost(env.canvas, { active: false, whClassId: 1 });
  expect(paint).not.toHaveBeenCalled();
  env.visible(true);
  expect(paint).toHaveBeenCalledTimes(1);
  expect(env.frames.size).toBe(0);
  host.update({ active: true, whClassId: 6, seed: '31000001' });
  expect(paint.mock.lastCall?.[1]).toMatchObject({ age: 0, palette: wormholePalette(6) });
  env.advance(3);
  expect(paint.mock.lastCall?.[1].age).toBeGreaterThan(WORMHOLE_IMPULSE_SETTLE_S);
  expect(env.frames.size).toBe(1);
  host.update({ active: false, whClassId: 6 });
  env.advance(3);
  expect(env.frames.size).toBe(0);
  host.dispose();
  expect(release).toHaveBeenCalledOnce();
});

test('selection and pause updates leave appearance styles untouched', () => {
  const env = browser();
  const host = createWormholeHost(env.canvas, { active: false, whClassId: 3, size: 60 });
  env.setProperty.mockClear();
  host.update({ active: true });
  host.update({ active: true, paused: true, whClassId: 3, size: 60 });
  expect(env.setProperty).not.toHaveBeenCalled();
  host.update({ active: true, whClassId: 4 });
  expect(env.setProperty).toHaveBeenCalledWith('--wormhole-size', '60px');
  host.dispose();
});

test('offscreen, tab-hidden, dragging pause and reduced motion immediately stop scheduled work', () => {
  const env = browser();
  const host = createWormholeHost(env.canvas, { active: true });
  env.visibleBatch([false, true]);
  expect(paint).toHaveBeenCalled();
  expect(env.frames.size).toBe(1);
  env.visibleBatch([true, false]);
  expect(env.frames.size).toBe(0);
  env.visible(true); env.advance(.2);
  env.visible(false);
  expect(env.frames.size).toBe(0);
  env.visible(true);
  env.doc.hidden = true; env.visibility();
  expect(env.frames.size).toBe(0);
  env.doc.hidden = false; env.visibility();
  host.update({ active: true, paused: true });
  expect(env.frames.size).toBe(0);
  expect(paint.mock.lastCall?.[1].age).toBe(10);
  host.update({ active: true, paused: false });
  env.media.matches = true; env.preference();
  expect(env.frames.size).toBe(0);
  expect(paint.mock.lastCall?.[1].age).toBe(10);
  host.dispose();
  expect(env.disconnect).toHaveBeenCalledOnce();
  expect(env.media.removeEventListener).toHaveBeenCalledOnce();
  expect(env.doc.removeEventListener).toHaveBeenCalledOnce();
});

test('GPU failure exposes a static fallback, and a later failure keeps the last bitmap until paint recovers', () => {
  const env = browser();
  paint.mockReturnValueOnce(false);
  const failed = createWormholeHost(env.canvas, { active: true, whClassId: 5, size: 10000 });
  env.visible(true);
  expect(env.canvas.dataset.ready).toBe('false');
  expect(env.frames.size).toBe(0);
  expect(env.context.clearRect).toHaveBeenCalled();
  expect(env.canvas.width).toBe(256);
  expect(env.setProperty).toHaveBeenCalledWith('--wormhole-size', '512px');
  failed.dispose();

  const host = createWormholeHost(env.canvas, { active: true, whClassId: 5 });
  env.visible(true);
  expect(env.canvas.dataset.ready).toBe('true');
  env.context.clearRect.mockClear();
  paint.mockReturnValueOnce(false);
  host.update({ active: true, whClassId: 5 });
  expect(env.canvas.dataset.ready).toBe('true');
  expect(env.context.clearRect).not.toHaveBeenCalled();
  expect(env.frames.size).toBe(0);
  env.recover();
  expect(env.canvas.dataset.ready).toBe('true');
  expect(env.frames.size).toBe(1);
  host.dispose();
});
