import type { ReactElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }));

vi.mock('react', () => ({
  Suspense: 'suspense',
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { EntranceOnce } from './EntranceOnce';

afterEach(() => {
  h.cleanups.length = 0;
  vi.unstubAllGlobals();
});

function mountListener() {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal('document', { addEventListener, removeEventListener });
  const rendered = EntranceOnce() as ReactElement<{ children: ReactElement }>;
  (rendered.props.children.type as () => null)();
  const [type, listener, capture] = addEventListener.mock.calls[0] ?? [];
  expect(type).toBe('animationend');
  expect(capture).toBe(true);
  const [removeListener, leaveRoute] = h.cleanups;
  return {
    listener: listener as (event: unknown) => void,
    removeEventListener,
    removeListener: removeListener!,
    leaveRoute: leaveRoute!,
  };
}

function fakeTarget(isConnected = true) {
  const attributes = new Map<string, string>();
  return {
    attributes,
    isConnected,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
}

test('marks finished entrances when the route changes, ignores other animations, and drops the listener on unmount', () => {
  const { listener, removeEventListener, removeListener, leaveRoute } = mountListener();

  const entrance = fakeTarget();
  const evicted = fakeTarget(false);
  const flash = fakeTarget();
  listener({ animationName: 'reveal', target: entrance });
  listener({ animationName: 'reveal', target: evicted });
  listener({ animationName: 'price-flash', target: flash });
  expect(entrance.attributes.has('data-entered')).toBe(false);

  leaveRoute();
  expect(entrance.attributes.get('data-entered')).toBe('');
  expect(evicted.attributes.has('data-entered')).toBe(false);
  expect(flash.attributes.has('data-entered')).toBe(false);

  removeListener();
  expect(removeEventListener).toHaveBeenCalledWith('animationend', listener, true);
});
