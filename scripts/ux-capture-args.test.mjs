import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyFlag,
  assignSlugs,
  networkFirst,
  parseArgs,
  slugify,
  summariseResults,
} from './ux-capture-args.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyFlag', () => {
  it('sets the base URL', () => {
    const opts = {};
    applyFlag(opts, 'base-url', 'http://localhost:4000');
    expect(opts.baseUrl).toBe('http://localhost:4000');
  });

  it('parses a numeric settle, including 0', () => {
    const opts = {};
    applyFlag(opts, 'settle', '2500');
    expect(opts.settle).toBe(2500);
    applyFlag(opts, 'settle', '0');
    expect(opts.settle).toBe(0);
  });

  it('ignores a non-numeric settle', () => {
    const opts = { settle: 1500 };
    applyFlag(opts, 'settle', 'soon');
    expect(opts.settle).toBe(1500);
  });

  it('filters viewports to known names (both --viewport and --viewports)', () => {
    const a = {};
    applyFlag(a, 'viewport', 'desktop, mobile, tablet');
    expect(a.viewports).toEqual(['desktop', 'mobile']);
    const b = {};
    applyFlag(b, 'viewports', 'nonsense');
    expect(b.viewports).toEqual([]);
  });

  it('warns on an unknown flag and changes nothing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const opts = {};
    applyFlag(opts, 'wat', 'x');
    expect(opts).toEqual({});
    expect(spy).toHaveBeenCalledWith('  (ignoring unknown flag --wat)');
  });
});

describe('parseArgs', () => {
  it('defaults to the smoke route when no routes are passed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { routes, opts } = parseArgs(['--base-url=http://localhost:3000']);
    expect(routes).toEqual(['/']);
    expect(opts.viewports).toEqual(['desktop', 'mobile']);
    expect(opts.settle).toBe(1500);
    expect(spy).toHaveBeenCalled();
  });

  it('prefixes positional routes with a leading slash and keeps absolute ones', () => {
    const { routes } = parseArgs(['sites', '/industry', 'sites/30002']);
    expect(routes).toEqual(['/sites', '/industry', '/sites/30002']);
  });

  it('reads --flag=value options', () => {
    const { opts } = parseArgs(['/', '--base-url=http://localhost:9', '--settle=0']);
    expect(opts.baseUrl).toBe('http://localhost:9');
    expect(opts.settle).toBe(0);
  });

  it('resets an emptied viewport list back to the default pair', () => {
    const { opts } = parseArgs(['/', '--viewport=nope']);
    expect(opts.viewports).toEqual(['desktop', 'mobile']);
  });
});

describe('slugify', () => {
  it.each([
    ['/', 'home'],
    ['', 'home'],
    ['/sites/30002', 'sites-30002'],
    // Trailing non-alphanumerics collapse to a trailing '-' (only leading/trailing
    // slashes are trimmed first) — `]` survives as a dash.
    ['/sites/[id]', 'sites-id-'],
    ['/a/b', 'a-b'],
    ['/industry/templates/', 'industry-templates'],
  ])('%s → %s', (route, expected) => {
    expect(slugify(route)).toBe(expected);
  });
});

describe('assignSlugs', () => {
  it('pairs each route with its slug', () => {
    expect(assignSlugs(['/sites', '/industry'])).toEqual([
      { route: '/sites', slug: 'sites' },
      { route: '/industry', slug: 'industry' },
    ]);
  });

  it('suffixes colliding slugs so files never overwrite', () => {
    // `/a/b` and `/a-b` both slugify to `a-b`.
    expect(assignSlugs(['/a/b', '/a-b', '/a/b/'])).toEqual([
      { route: '/a/b', slug: 'a-b' },
      { route: '/a-b', slug: 'a-b-2' },
      { route: '/a/b/', slug: 'a-b-3' },
    ]);
  });
});

describe('networkFirst', () => {
  it('prefers the first 4xx/5xx response', () => {
    const r = {
      httpErrors: [{ url: 'http://x/y', status: 500 }],
      failedRequests: [{ url: 'http://x/z', error: 'net::ERR' }],
    };
    expect(networkFirst(r)).toBe('500 http://x/y');
  });

  it('falls back to the first failed request when there is no http error', () => {
    const r = {
      httpErrors: [],
      failedRequests: [{ url: 'http://x/z', error: 'net::ERR_FAILED' }],
    };
    expect(networkFirst(r)).toBe('net::ERR_FAILED http://x/z');
  });
});

describe('summariseResults', () => {
  const clean = {
    route: '/',
    viewport: 'desktop',
    screenshots: ['a.png', 'b.png'],
    loadError: null,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
  };

  it('counts screenshots and produces no rows for a clean sweep', () => {
    const out = summariseResults([clean, { ...clean, screenshots: ['c.png'] }]);
    expect(out).toEqual({
      shotCount: 3,
      loadRows: [],
      consoleRows: [],
      networkRows: [],
    });
  });

  it('shapes a load-error row', () => {
    const out = summariseResults([{ ...clean, loadError: 'boom' }]);
    expect(out.loadRows).toEqual(['/ [desktop]: boom']);
  });

  it('shapes a console/page-error row with the count and first message', () => {
    const out = summariseResults([
      { ...clean, consoleErrors: ['bad thing'], pageErrors: ['worse thing'] },
    ]);
    expect(out.consoleRows).toEqual(['/ [desktop]: 2 — bad thing']);
  });

  it('shapes a network row combining failed + http errors', () => {
    const out = summariseResults([
      {
        ...clean,
        failedRequests: [{ url: 'http://x/z', error: 'net::ERR' }],
        httpErrors: [{ url: 'http://x/y', status: 404 }],
      },
    ]);
    expect(out.networkRows).toEqual(['/ [desktop]: 2 — 404 http://x/y']);
  });
});
