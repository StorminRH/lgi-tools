import { describe, expect, it } from 'vitest';
import { diffRoutes, discoveredKeys, isRouteFile, routeKey } from './route-presence.mjs';

describe('isRouteFile', () => {
  it('accepts page/route/sitemap/robots files across ts+js', () => {
    for (const base of ['page.tsx', 'route.ts', 'page.jsx', 'route.js', 'sitemap.ts', 'robots.tsx']) {
      expect(isRouteFile(base)).toBe(true);
    }
  });

  it('rejects non-route files', () => {
    for (const base of ['layout.tsx', 'helpers.ts', 'page.css', 'not-found.tsx']) {
      expect(isRouteFile(base)).toBe(false);
    }
  });
});

describe('routeKey', () => {
  it('maps the root page to /', () => {
    expect(routeKey('page.tsx')).toBe('/');
  });

  it('maps a nested route to its directory path', () => {
    expect(routeKey('sites/[id]/page.tsx')).toBe('/sites/[id]');
    expect(routeKey('api/account/structures/route.ts')).toBe('/api/account/structures');
  });

  it('maps sitemap and robots to their served paths', () => {
    expect(routeKey('sitemap.ts')).toBe('/sitemap.xml');
    expect(routeKey('robots.tsx')).toBe('/robots.txt');
    expect(routeKey('docs/sitemap.ts')).toBe('/docs/sitemap.xml');
  });
});

describe('discoveredKeys', () => {
  it('derives keys from absolute paths relative to the app dir', () => {
    const keys = discoveredKeys(
      ['src/app/page.tsx', 'src/app/sites/[id]/route.ts'],
      'src/app',
    );
    expect([...keys].sort()).toEqual(['/', '/sites/[id]']);
  });
});

describe('diffRoutes', () => {
  it('reports both a missing route and a stale entry, sorted', () => {
    const discovered = new Set(['/', '/sites', '/industry']);
    const classified = new Set(['/', '/sites', '/legacy']);
    expect(diffRoutes(discovered, classified)).toEqual({
      missing: ['/industry'],
      stale: ['/legacy'],
    });
  });

  it('is empty when the sets match', () => {
    const s = new Set(['/', '/sites']);
    expect(diffRoutes(s, new Set(['/', '/sites']))).toEqual({ missing: [], stale: [] });
  });
});
