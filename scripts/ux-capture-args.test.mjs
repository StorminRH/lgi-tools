import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignSlugs,
  parseArgs,
  summariseResults,
} from './ux-capture-args.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ux-capture args helpers', () => {
  it('parseArgs sets known options and ignores junk', () => {
    const flagged = parseArgs([
      '/',
      '--base-url=http://localhost:4000',
      '--settle=2500',
    ]);
    expect(flagged.opts).toMatchObject({
      baseUrl: 'http://localhost:4000',
      settle: 2500,
    });

    expect(parseArgs(['/', '--settle=2500', '--settle=soon']).opts.settle).toBe(2500);
    expect(parseArgs(['/', '--settle=2500', '--settle=0']).opts.settle).toBe(0);

    expect(parseArgs(['/', '--viewport=desktop, mobile, tablet']).opts.viewports).toEqual([
      'desktop',
      'mobile',
      'tablet',
    ]);
    expect(parseArgs(['/', '--viewports=wide, cinema']).opts.viewports).toEqual(['wide']);

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = parseArgs(['/', '--settle=2500']);
    const ignored = parseArgs(['/', '--settle=2500', '--wat=x']);
    expect(ignored.opts.settle).toBe(before.opts.settle);
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
    ['/sites/[id]', 'sites-id-'],
    ['/a/b', 'a-b'],
    ['/industry/templates/', 'industry-templates'],
  ])('assignSlugs %s → %s', (route, expected) => {
    expect(assignSlugs([route])[0].slug).toBe(expected);
  });

  it('assignSlugs pairs routes and suffixes collisions', () => {
    expect(assignSlugs(['/sites', '/industry'])).toEqual([
      { route: '/sites', slug: 'sites' },
      { route: '/industry', slug: 'industry' },
    ]);
    expect(assignSlugs(['/a/b', '/a-b', '/a/b/'])).toEqual([
      { route: '/a/b', slug: 'a-b' },
      { route: '/a-b', slug: 'a-b-2' },
      { route: '/a/b/', slug: 'a-b-3' },
    ]);
  });

  it('summariseResults prefers http errors then failed requests', () => {
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
      summariseResults([
        {
          ...clean,
          failedRequests: [{ url: 'http://x/z', error: 'net::ERR' }],
          httpErrors: [{ url: 'http://x/y', status: 500 }],
        },
      ]).networkRows,
    ).toEqual(['/ [desktop]: 2 — 500 http://x/y']);
    expect(
      summariseResults([
        {
          ...clean,
          failedRequests: [{ url: 'http://x/z', error: 'net::ERR_FAILED' }],
        },
      ]).networkRows,
    ).toEqual(['/ [desktop]: 1 — net::ERR_FAILED http://x/z']);
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
