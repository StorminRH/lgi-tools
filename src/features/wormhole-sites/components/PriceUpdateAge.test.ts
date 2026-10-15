import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { PriceUpdateAge } from './PriceUpdateAge';

const hydration = vi.hoisted(() => ({ done: false }));

// The real hook reads as hydrating in a server render; `done` stands in for
// the client render after this component hydrates.
vi.mock('@/lib/use-hydrating', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/use-hydrating')>();
  return {
    useHydrating: () => {
      const hydrating = actual.useHydrating();
      return hydration.done ? false : hydrating;
    },
  };
});

const NOW = Date.parse('2026-10-13T12:00:00Z');

const render = (updatedAt: Date | null) => renderToStaticMarkup(createElement(PriceUpdateAge, { updatedAt }));

afterEach(() => {
  hydration.done = false;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('the server and hydration renders show a dash without reading the clock', () => {
  const clock = vi.spyOn(Date, 'now');
  expect(render(new Date(NOW - 5 * 60_000))).toBe('—');
  expect(clock).not.toHaveBeenCalled();
});

test('after hydration the age reads the browser clock', () => {
  vi.useFakeTimers({ now: NOW });
  hydration.done = true;
  expect(render(new Date(NOW - 5 * 60_000))).toBe('5m ago');
  expect(render(new Date(NOW - 30_000))).toBe('just now');
  expect(render(new Date(NOW - 40 * 86_400_000))).toBe('1mo ago');
});

test('with no price update yet it shows a dash and starts no clock', () => {
  hydration.done = true;
  const clock = vi.spyOn(Date, 'now');
  expect(render(null)).toBe('—');
  expect(clock).not.toHaveBeenCalled();
});
