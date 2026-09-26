import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }));

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
}));

import { EntranceOnce } from './EntranceOnce';

const ENTRANCE_RULES = [
  ['src/app/globals.css', 'reveal'],
  ['src/components/composition/HomeFeatureCards.css', 'home-preview-row'],
  ['src/components/composition/HomeFeatureCards.css', 'home-preview-draw'],
] as const;

afterEach(() => {
  h.cleanups.length = 0;
  vi.unstubAllGlobals();
});

function mountListener() {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal('document', { addEventListener, removeEventListener });
  EntranceOnce();
  const [type, listener, capture] = addEventListener.mock.calls[0] ?? [];
  expect(type).toBe('animationend');
  expect(capture).toBe(true);
  return { listener: listener as (event: unknown) => void, removeEventListener };
}

function fakeTarget() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
}

test('marks an element once its page entrance finishes, and ignores other animations', () => {
  const { listener } = mountListener();

  const entrance = fakeTarget();
  listener({ animationName: 'reveal', target: entrance });
  expect(entrance.attributes.get('data-entered')).toBe('');

  const flash = fakeTarget();
  listener({ animationName: 'price-flash', target: flash });
  expect(flash.attributes.has('data-entered')).toBe(false);
});

test('removes the listener on unmount', () => {
  const { listener, removeEventListener } = mountListener();
  h.cleanups.at(-1)?.();
  expect(removeEventListener).toHaveBeenCalledWith('animationend', listener, true);
});

test('every marked entrance has a stylesheet rule that stops it replaying', () => {
  for (const [file, className] of ENTRANCE_RULES) {
    const css = readFileSync(file, 'utf8');
    const rule = new RegExp(String.raw`\.${className}\[data-entered\]\s*\{[^}]*animation:\s*none`);
    expect(rule.test(css), `.${className}[data-entered] needs animation: none`).toBe(true);
  }
});
