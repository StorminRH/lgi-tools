import { describe, expect, it } from 'vitest';
import { diffRoutes, discoveredKeys, isRouteFile, routeKey } from './route-presence.mjs';

describe('isRouteFile', () => {
  it('accepts page/route and supported metadata files and rejects non-routes', () => {
    for (const base of [
      'page.tsx',
      'route.ts',
      'page.jsx',
      'route.js',
      'sitemap.ts',
      'robots.tsx',
      'opengraph-image.tsx',
      'twitter-image.js',
      'icon.svg',
      'icon.png',
      'icon2.ico',
    ]) {
      expect(isRouteFile(base)).toBe(true);
    }

    for (const base of ['layout.tsx', 'helpers.ts', 'page.css', 'not-found.tsx']) {
      expect(isRouteFile(base)).toBe(false);
    }

    // Discovering favicon.ico would report a false missing route: it deliberately
    // has no entry in route-classification.json; the post-build check filters it.
    expect(isRouteFile('favicon.ico')).toBe(false);
  });
});

describe('routeKey', () => {
  it('maps pages, API routes, and route groups to their served paths', () => {
    expect(routeKey('page.tsx')).toBe('/');
    expect(routeKey('sites/[id]/page.tsx')).toBe('/sites/[id]');
    expect(routeKey('api/account/structures/route.ts')).toBe('/api/account/structures');
    expect(routeKey('(site)/sites/[id]/page.tsx')).toBe('/sites/[id]');
    expect(routeKey('(site)/page.tsx')).toBe('/');
    expect(routeKey('sitemap.ts')).toBe('/sitemap.xml');
    expect(routeKey('robots.tsx')).toBe('/robots.txt');
    expect(routeKey('docs/sitemap.ts')).toBe('/docs/sitemap.xml');
  });

  it('maps social-image and icon metadata files, including route-group hashes', () => {
    expect(routeKey('opengraph-image.tsx')).toBe('/opengraph-image');
    expect(routeKey('sites/[id]/opengraph-image.tsx')).toBe('/sites/[id]/opengraph-image');
    expect(routeKey('docs/twitter-image.js')).toBe('/docs/twitter-image');

    // A group is invisible in the served path but not in the built route id:
    // Next appends djb2Hash of the grouped parent so two handlers sharing a
    // public path stay distinct. This key must match the id the build manifest
    // reports, or the presence check and the render-mode check disagree — which
    // is exactly what broke the deploy when /sites/[id] moved under (site).
    expect(routeKey('(site)/sites/[id]/opengraph-image.tsx')).toBe(
      '/sites/[id]/opengraph-image-38dcjp',
    );
    expect(routeKey('(map)/atlas/opengraph-image.tsx')).toBe(
      '/atlas/opengraph-image-ci9ouf',
    );
    // Ungrouped parents keep the plain served path.
    expect(routeKey('sites/[id]/opengraph-image.tsx')).toBe(
      '/sites/[id]/opengraph-image',
    );

    expect(routeKey('icon.svg')).toBe('/icon.svg');
    expect(routeKey('docs/icon.png')).toBe('/docs/icon.png');
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
  it('reports missing and stale routes when sets diverge, and nothing when they match', () => {
    const discovered = new Set(['/', '/sites', '/industry']);
    const classified = new Set(['/', '/sites', '/legacy']);
    expect(diffRoutes(discovered, classified)).toEqual({
      missing: ['/industry'],
      stale: ['/legacy'],
    });

    const matched = new Set(['/', '/sites']);
    expect(diffRoutes(matched, new Set(['/', '/sites']))).toEqual({
      missing: [],
      stale: [],
    });
  });
});
