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

describe('ux-capture args helpers', () => {
  it('applyFlag sets known options and ignores junk', () => {
    const opts = {};
    applyFlag(opts, 'base-url', 'http://localhost:4000');
    applyFlag(opts, 'settle', '2500');
    expect(opts).toEqual({ baseUrl: 'http://localhost:4000', settle: 2500 });

    applyFlag(opts, 'settle', '0');
    expect(opts.settle).toBe(0);
    applyFlag(opts, 'settle', 'soon');
    expect(opts.settle).toBe(0);

    applyFlag(opts, 'viewport', 'desktop, mobile, tablet');
    expect(opts.viewports).toEqual(['desktop', 'mobile', 'tablet']);
    applyFlag(opts, 'viewports', 'wide, cinema');
    expect(opts.viewports).toEqual(['wide']);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = { ...opts };
    applyFlag(opts, 'wat', 'x');
    expect(opts).toEqual(before);
    expect(spy).toHaveBeenCalledWith('  (ignoring unknown flag --wat)');
  });

  it('parseArgs defaults, normalizes routes, and reads option flags', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const smoke = parseArgs(['--base-url=http://localhost:3000']);
    expect(smoke.routes).toEqual(['/']);
    expect(smoke.opts.viewports).toEqual(['desktop', 'mobile']);
    expect(smoke.opts.settle).toBe(1500);
    expect(spy).toHaveBeenCalled();

    expect(parseArgs(['sites', '/industry', 'sites/30002']).routes).toEqual([
      '/sites',
      '/industry',
      '/sites/30002',
    ]);

    const flagged = parseArgs([
      '/',
      '--base-url=http://localhost:9',
      '--settle=0',
      '--storage-state=docs/ux-check/captures/auth-storage.json',
      '--cookie-jar=/tmp/cookies.txt',
    ]);
    expect(flagged.opts).toMatchObject({
      baseUrl: 'http://localhost:9',
      settle: 0,
      storageState: 'docs/ux-check/captures/auth-storage.json',
      cookieJar: '/tmp/cookies.txt',
    });

    expect(parseArgs(['/', '--viewport=nope']).opts.viewports).toEqual(['desktop', 'mobile']);
  });

  it.each([
    ['/', 'home'],
    ['', 'home'],
    ['/sites/30002', 'sites-30002'],
    // Trailing non-alphanumerics collapse to a trailing '-' (only leading/trailing
    // slashes are trimmed first) — `]` survives as a dash.
    ['/sites/[id]', 'sites-id-'],
    ['/a/b', 'a-b'],
    ['/industry/templates/', 'industry-templates'],
  ])('slugify %s → %s', (route, expected) => {
    expect(slugify(route)).toBe(expected);
  });

  it('assignSlugs pairs routes and suffixes collisions', () => {
    expect(assignSlugs(['/sites', '/industry'])).toEqual([
      { route: '/sites', slug: 'sites' },
      { route: '/industry', slug: 'industry' },
    ]);
    // `/a/b` and `/a-b` both slugify to `a-b`.
    expect(assignSlugs(['/a/b', '/a-b', '/a/b/'])).toEqual([
      { route: '/a/b', slug: 'a-b' },
      { route: '/a-b', slug: 'a-b-2' },
      { route: '/a/b/', slug: 'a-b-3' },
    ]);
  });

  it('networkFirst prefers http errors then failed requests', () => {
    expect(
      networkFirst({
        httpErrors: [{ url: 'http://x/y', status: 500 }],
        failedRequests: [{ url: 'http://x/z', error: 'net::ERR' }],
      }),
    ).toBe('500 http://x/y');
    expect(
      networkFirst({
        httpErrors: [],
        failedRequests: [{ url: 'http://x/z', error: 'net::ERR_FAILED' }],
      }),
    ).toBe('net::ERR_FAILED http://x/z');
  });

  it('summariseResults shapes artifact counts and failure rows', () => {
    const clean = {
      route: '/',
      viewport: 'desktop',
      failureArtifacts: [],
      screenshots: [],
      loadError: null,
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      httpErrors: [],
    };

    expect(
      summariseResults([clean, { ...clean, failureArtifacts: ['a.png', 'b.png'] }]),
    ).toEqual({
      failureArtifactCount: 2,
      loadRows: [],
      consoleRows: [],
      networkRows: [],
    });

    const { failureArtifacts: _omit, ...legacy } = clean;
    expect(summariseResults([{ ...legacy, screenshots: ['old.png'] }]).failureArtifactCount).toBe(
      1,
    );

    expect(summariseResults([{ ...clean, loadError: 'boom' }]).loadRows).toEqual([
      '/ [desktop]: boom',
    ]);
    expect(
      summariseResults([
        { ...clean, consoleErrors: ['bad thing'], pageErrors: ['worse thing'] },
      ]).consoleRows,
    ).toEqual(['/ [desktop]: 2 — bad thing']);
    expect(
      summariseResults([
        {
          ...clean,
          failedRequests: [{ url: 'http://x/z', error: 'net::ERR' }],
          httpErrors: [{ url: 'http://x/y', status: 404 }],
        },
      ]).networkRows,
    ).toEqual(['/ [desktop]: 2 — 404 http://x/y']);
  });
});
