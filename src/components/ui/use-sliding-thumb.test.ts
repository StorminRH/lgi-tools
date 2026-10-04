import { afterEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ cleanup: null as null | (() => void) }));
vi.mock('react', () => ({
  useLayoutEffect: (effect: () => (() => void) | void) => {
    h.cleanup = effect() ?? null;
  },
}));

const observed = { callback: null as null | (() => void), disconnect: vi.fn() };
vi.stubGlobal('ResizeObserver', class {
  constructor(callback: () => void) {
    observed.callback = callback;
  }
  observe() {}
  disconnect() {
    observed.disconnect();
  }
});

const { useSlidingThumb } = await import('./use-sliding-thumb');

const box = { offsetLeft: 4, offsetTop: 3, offsetWidth: 52, offsetHeight: 26 };
function elements(pressed: typeof box | null) {
  const attributes = new Set<string>();
  const host = {
    querySelector: vi.fn(() => pressed),
    setAttribute: (name: string) => void attributes.add(name),
    removeAttribute: (name: string) => void attributes.delete(name),
    hasAttribute: (name: string) => attributes.has(name),
  };
  const marker = { style: { setProperty: vi.fn() } };
  return { host, marker, track: { current: host as unknown as HTMLElement }, thumb: { current: marker as unknown as HTMLElement } };
}

afterEach(() => {
  h.cleanup = null;
  observed.disconnect.mockReset();
});

test('the thumb sits under the pressed item, and the track says it is placed', () => {
  const { host, marker, track, thumb } = elements(box);
  useSlidingThumb(track, thumb, 'net');
  expect(host.querySelector).toHaveBeenCalledWith('[aria-pressed="true"]');
  expect(marker.style.setProperty.mock.calls).toEqual([
    ['--thumb-left', '4px'],
    ['--thumb-top', '3px'],
    ['--thumb-width', '52px'],
    ['--thumb-height', '26px'],
  ]);
  expect(host.hasAttribute('data-thumb')).toBe(true);
});

test('a resized track places the thumb again, and it stops watching when unmounted', () => {
  const { marker, track, thumb } = elements(box);
  useSlidingThumb(track, thumb, 'net');
  observed.callback?.();
  expect(marker.style.setProperty).toHaveBeenCalledTimes(8);
  h.cleanup?.();
  expect(observed.disconnect).toHaveBeenCalled();
});

test('with nothing pressed the thumb is not shown', () => {
  const { host, marker, track, thumb } = elements(null);
  host.setAttribute('data-thumb');
  useSlidingThumb(track, thumb, 'none');
  expect(host.hasAttribute('data-thumb')).toBe(false);
  expect(marker.style.setProperty).not.toHaveBeenCalled();
});

test('before the elements exist nothing happens', () => {
  useSlidingThumb({ current: null }, { current: null }, 'net');
  expect(h.cleanup).toBeNull();
});
