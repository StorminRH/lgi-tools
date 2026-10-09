import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  state: undefined as unknown,
  setState: vi.fn(),
  effects: [] as Array<() => void | (() => void)>,
}));

// Server rendering runs no effects, so the test runs the load effect itself
// and renders what it settles on as the next state.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: <T>(initial: T) => [actual.useState((h.state ?? initial) as T)[0], h.setState],
    useEffect: (effect: () => void | (() => void)) => {
      h.effects.push(effect);
    },
  };
});
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

import { siteDetailEndpoint } from './api-contract';
import { MOCK_SITES } from './mock-data';
import { SiteCardWidget } from './widget';

function render(siteId: number, state?: unknown) {
  h.state = state;
  h.effects.length = 0;
  h.setState.mockClear();
  h.apiFetch.mockClear();
  const html = renderToStaticMarkup(createElement(SiteCardWidget, { siteId }));
  return { html, load: () => h.effects[0]!() };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the widget loads its site, settles a network failure on the error notice, and ignores a read it abandoned', async () => {
  const loading = render(7);
  expect(loading.html).toContain('Loading wormhole site');
  h.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'network', aborted: false, cause: new Error('offline') });
  loading.load();
  await settle();
  expect(h.apiFetch).toHaveBeenCalledExactlyOnceWith(siteDetailEndpoint, {
    params: { id: 7 },
    signal: expect.any(AbortSignal),
  });
  expect(h.setState).toHaveBeenCalledExactlyOnceWith({ siteId: 7, status: 'error' });
  const failed = render(7, h.setState.mock.calls[0]![0]);
  expect(failed.html).toContain('This wormhole site could not be loaded.');
  expect(failed.html).not.toContain('Loading wormhole site');

  const site = MOCK_SITES[0]!;
  h.apiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: site });
  render(8).load();
  await settle();
  expect(h.setState).toHaveBeenCalledExactlyOnceWith({ siteId: 8, status: 'ready', site });

  // Moving to another site shows it loading, never the previous site's notice.
  expect(render(9, { siteId: 7, status: 'error' }).html).toContain('Loading wormhole site');

  let answer!: (value: unknown) => void;
  h.apiFetch.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
  const leave = render(9).load();
  const { signal } = h.apiFetch.mock.calls[0]![1] as { signal: AbortSignal };
  leave?.();
  expect(signal.aborted).toBe(true);
  answer({ ok: false, kind: 'network', aborted: true, cause: new DOMException('aborted', 'AbortError') });
  await settle();
  expect(h.setState).not.toHaveBeenCalled();
});
