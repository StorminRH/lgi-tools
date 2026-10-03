import type { ReactElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  effects: [] as Array<() => void>,
  pathname: '/',
  ref: null as { current: string } | null,
}));

vi.mock('react', () => ({
  Suspense: 'suspense',
  useEffect: (effect: () => void | (() => void)) => {
    h.effects.push(effect as () => void);
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
  useRef: (initial: string) => (h.ref ??= { current: initial }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }));

import { EntranceOnce } from './EntranceOnce';

afterEach(() => {
  h.cleanups.length = 0;
  h.effects.length = 0;
  h.pathname = '/';
  h.ref = null;
  vi.unstubAllGlobals();
});

function mountListener() {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  vi.stubGlobal('document', { addEventListener, removeEventListener });
  const rendered = EntranceOnce() as ReactElement<{ children: ReactElement }>;
  const markOnRouteChange = rendered.props.children.type as () => null;
  markOnRouteChange();
  const [type, listener, capture] = addEventListener.mock.calls[0] ?? [];
  expect(type).toBe('animationend');
  expect(capture).toBe(true);
  const [removeListener] = h.cleanups;
  return {
    listener: listener as (event: unknown) => void,
    removeEventListener,
    removeListener: removeListener!,
    // Strict Mode runs a fresh mount's effects twice.
    replayMount: () => h.effects.at(-1)!(),
    navigate: (pathname: string) => {
      h.pathname = pathname;
      markOnRouteChange();
    },
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
  const { listener, removeEventListener, removeListener, replayMount, navigate } = mountListener();

  const entrance = fakeTarget();
  const evicted = fakeTarget(false);
  const flash = fakeTarget();
  listener({ animationName: 'reveal', target: entrance });
  listener({ animationName: 'reveal', target: evicted });
  listener({ animationName: 'price-flash', target: flash });
  expect(entrance.attributes.has('data-entered')).toBe(false);

  // A replayed mount is not a route change: the page may still be hydrating.
  replayMount();
  expect(entrance.attributes.has('data-entered')).toBe(false);

  navigate('/industry');
  expect(entrance.attributes.get('data-entered')).toBe('');
  expect(evicted.attributes.has('data-entered')).toBe(false);
  expect(flash.attributes.has('data-entered')).toBe(false);

  removeListener();
  expect(removeEventListener).toHaveBeenCalledWith('animationend', listener, true);
});
