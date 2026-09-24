import { afterEach, expect, test, vi } from 'vitest';
import type { WormholeEffect } from '@/data/eve-data/wormhole-contract';
import { createWormholeHost } from './host';
import { WORMHOLE_IMPULSE_SETTLE_S } from './motion';
import type { WormholePaint } from './painter';
import { bodyAppearance, type WormholeBody } from './palette';

const { paint, release } = vi.hoisted(() => ({
  paint: vi.fn<(target: unknown, input: WormholePaint) => boolean>(() => true),
  release: vi.fn(),
}));
vi.mock('./painter', () => ({ acquireWormholePainter: () => ({ paint, release }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const wormhole = (classId: number, effect: WormholeEffect | null = null): WormholeBody =>
  ({ kind: 'wormhole', classId, effect });
const planet = (security: number): WormholeBody => ({ kind: 'planet', security });
const classPalette = (classId: number) => bodyAppearance(wormhole(classId), () => '').palette;

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
  const tokens: Record<string, string> = {};
  const doc = { hidden: false, addEventListener: (_: string, fn: () => void) => { visibility = fn; }, removeEventListener: vi.fn() };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('window', {
    devicePixelRatio: 2, matchMedia: () => media,
    getComputedStyle: () => ({ getPropertyValue: (token: string) => tokens[token] ?? '' }),
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
    canvas, frames, context, media, doc, disconnect, setProperty, tokens,
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
  const host = createWormholeHost(env.canvas, { active: false, body: wormhole(1) });
  expect(paint).not.toHaveBeenCalled();
  env.visible(true);
  expect(paint).toHaveBeenCalledTimes(1);
  expect(env.frames.size).toBe(0);
  host.update({ active: true, body: wormhole(6), seed: '31000001' });
  expect(paint.mock.lastCall?.[1]).toMatchObject({ age: 0, mode: 0, palette: classPalette(6) });
  env.advance(3);
  expect(paint.mock.lastCall?.[1].age).toBeGreaterThan(WORMHOLE_IMPULSE_SETTLE_S);
  expect(env.frames.size).toBe(1);
  host.update({ active: false, body: wormhole(6) });
  env.advance(3);
  expect(env.frames.size).toBe(0);
  host.dispose();
  expect(release).toHaveBeenCalledOnce();
});

test('selection, pause and same-band security updates leave appearance styles untouched', () => {
  const env = browser();
  const host = createWormholeHost(env.canvas, { active: false, body: wormhole(3) });
  env.setProperty.mockClear();
  host.update({ active: true });
  host.update({ active: true, paused: true, body: wormhole(3) });
  expect(env.setProperty).not.toHaveBeenCalled();
  host.update({ active: true, body: wormhole(4) });
  expect(env.setProperty).toHaveBeenCalledWith('--wormhole-core', 'rgb(110 64 107)');

  env.tokens['--color-sec-04'] = ' #dc6c06';
  env.tokens['--color-sec-05'] = ' #f5ff83';
  host.update({ active: true, body: planet(0.43) });
  expect(env.setProperty).toHaveBeenLastCalledWith('--wormhole-tint', 'rgb(220 108 6)');
  env.setProperty.mockClear();
  host.update({ active: true, body: planet(0.44) });
  expect(env.setProperty).not.toHaveBeenCalled();
  host.update({ active: true, body: planet(0.46) });
  expect(env.setProperty).toHaveBeenLastCalledWith('--wormhole-tint', 'rgb(245 255 131)');
  host.dispose();
});

test('aura and planet bodies send their mode, token tint and focus, and idle nodes stop', () => {
  const env = browser();
  env.tokens['--color-effect-magnetar'] = ' #c48cff';
  const host = createWormholeHost(env.canvas, { active: false, body: wormhole(4, 'magnetar') });
  env.visible(true);
  expect(paint.mock.lastCall?.[1]).toMatchObject({ mode: 3, tint: [196 / 255, 140 / 255, 1], focus: 0 });
  expect(env.frames.size).toBe(0);
  host.update({ active: true });
  env.advance(1);
  expect(paint.mock.lastCall?.[1].focus).toBeGreaterThan(0.9);
  host.update({ active: false });
  env.advance(3);
  expect(env.frames.size).toBe(0);

  host.update({ active: false, body: planet(0.9) });
  expect(paint.mock.lastCall?.[1]).toMatchObject({ mode: 7, tint: [0.53, 0.61, 0.68] });
  expect(env.setProperty).toHaveBeenLastCalledWith('--wormhole-tint', 'rgb(135 156 173)');
  expect(env.frames.size).toBe(0);
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
  const failed = createWormholeHost(env.canvas, { active: true, body: wormhole(5) });
  env.visible(true);
  expect(env.canvas.dataset.ready).toBe('false');
  expect(env.frames.size).toBe(0);
  expect(env.context.clearRect).toHaveBeenCalled();
  expect(env.canvas.width).toBe(220);
  expect(env.setProperty).toHaveBeenCalledWith('--wormhole-size', '110px');
  expect(env.setProperty).toHaveBeenCalledWith('--wormhole-sphere', '55px');
  failed.dispose();

  const host = createWormholeHost(env.canvas, { active: true, body: wormhole(5) });
  env.visible(true);
  expect(env.canvas.dataset.ready).toBe('true');
  env.context.clearRect.mockClear();
  paint.mockReturnValueOnce(false);
  host.update({ active: true, body: wormhole(5) });
  expect(env.canvas.dataset.ready).toBe('true');
  expect(env.context.clearRect).not.toHaveBeenCalled();
  expect(env.frames.size).toBe(0);
  env.recover();
  expect(env.canvas.dataset.ready).toBe('true');
  expect(env.frames.size).toBe(1);
  host.dispose();
});
