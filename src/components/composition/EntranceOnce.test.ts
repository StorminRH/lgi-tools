import { afterEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }));

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
}));

import { EntranceOnce } from './EntranceOnce';

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

test('marks a finished page entrance, ignores other animations, and drops the listener on unmount', () => {
  const { listener, removeEventListener } = mountListener();

  const entrance = fakeTarget();
  listener({ animationName: 'reveal', target: entrance });
  expect(entrance.attributes.get('data-entered')).toBe('');

  const flash = fakeTarget();
  listener({ animationName: 'price-flash', target: flash });
  expect(flash.attributes.has('data-entered')).toBe(false);

  h.cleanups.at(-1)?.();
  expect(removeEventListener).toHaveBeenCalledWith('animationend', listener, true);
});
