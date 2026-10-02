import { afterEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({
  root: null as {
    querySelector: (selector: string) => (EventTarget & { open: boolean }) | null;
  } | null,
  cleanup: undefined as (() => void) | undefined,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => ({ current: lifecycle.root }),
  useEffect: (effect: () => void | (() => void)) => {
    lifecycle.cleanup = effect() ?? undefined;
  },
}));

import { UrlSync } from './url-sync';

function mount(basePath: string, entityId: number | string, href: string) {
  const details = Object.assign(new EventTarget(), { open: false });
  const browser = {
    location: new URL(href),
    history: {
      replaceState(_state: unknown, _unused: string, next?: string | URL | null): void {
        if (next != null) browser.location = new URL(next, browser.location.href);
      },
    },
  };
  vi.stubGlobal('window', browser);
  lifecycle.root = { querySelector: (selector) => selector === 'details' ? details : null };
  UrlSync({ basePath, entityId, children: null });
  return { details, browser };
}

afterEach(() => {
  lifecycle.cleanup?.();
  lifecycle.cleanup = undefined;
  lifecycle.root = null;
  vi.unstubAllGlobals();
});

describe('UrlSync', () => {
  it('opens and closes a site path while preserving the current query', () => {
    const { details, browser } = mount('/sites', 42, 'http://localhost:3000/sites?sort=name&dir=desc');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(browser.location.href).toBe('http://localhost:3000/sites/42?sort=name&dir=desc');

    browser.location = new URL('http://localhost:3000/sites/42?sort=isk&dir=asc');
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(browser.location.href).toBe('http://localhost:3000/sites?sort=isk&dir=asc');
  });

  it('keeps the query outside an empty base fragment when opening and closing', () => {
    const { details, browser } = mount(
      '/preview/primitives#',
      'collapsible-sample',
      'http://localhost:3000/preview/primitives?sort=name&dir=desc',
    );
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(browser.location.href).toBe(
      'http://localhost:3000/preview/primitives?sort=name&dir=desc#/collapsible-sample',
    );
    expect(browser.location.search).toBe('?sort=name&dir=desc');

    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(browser.location.href).toBe('http://localhost:3000/preview/primitives?sort=name&dir=desc#');
  });

  it('restores an existing base fragment when closing', () => {
    const { details, browser } = mount(
      '/preview/primitives#structure',
      'collapsible-sample',
      'http://localhost:3000/preview/primitives?sort=margin&dir=asc#structure',
    );
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(browser.location.href).toBe(
      'http://localhost:3000/preview/primitives?sort=margin&dir=asc#structure/collapsible-sample',
    );

    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(browser.location.href).toBe(
      'http://localhost:3000/preview/primitives?sort=margin&dir=asc#structure',
    );
  });

  it('stops updating the URL after unmount', () => {
    const { details, browser } = mount('/sites', 42, 'http://localhost:3000/sites?sort=name');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    expect(browser.location.href).toBe('http://localhost:3000/sites/42?sort=name');

    lifecycle.cleanup?.();
    details.open = false;
    details.dispatchEvent(new Event('toggle'));
    expect(browser.location.href).toBe('http://localhost:3000/sites/42?sort=name');
  });
});
