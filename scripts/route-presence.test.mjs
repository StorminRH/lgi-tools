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

const pageRoot = ['page.tsx', '/'];
const sitesIdPage = ['sites/[id]/page.tsx', '/sites/[id]'];
const apiStructures = ['api/account/structures/route.ts', '/api/account/structures'];
const groupedSitesId = ['(site)/sites/[id]/page.tsx', '/sites/[id]'];
const groupedSiteRoot = ['(site)/page.tsx', '/'];
const sitemapRoot = ['sitemap.ts', '/sitemap.xml'];
const robotsRoot = ['robots.tsx', '/robots.txt'];
const docsSitemap = ['docs/sitemap.ts', '/docs/sitemap.xml'];
const opengraphRoot = ['opengraph-image.tsx', '/opengraph-image'];
const sitesOpengraph = ['sites/[id]/opengraph-image.tsx', '/sites/[id]/opengraph-image'];
const docsTwitter = ['docs/twitter-image.js', '/docs/twitter-image'];
const groupedSitesOpengraph = ['(site)/sites/[id]/opengraph-image.tsx', '/sites/[id]/opengraph-image-38dcjp'];
const groupedAtlasOpengraph = ['(map)/atlas/opengraph-image.tsx', '/atlas/opengraph-image-ci9ouf'];
const iconSvg = ['icon.svg', '/icon.svg'];
const docsIcon = ['docs/icon.png', '/docs/icon.png'];

describe('routeKey', () => {
  it.each([
    pageRoot,
    sitesIdPage,
    apiStructures,
    groupedSitesId,
    groupedSiteRoot,
    sitemapRoot,
    robotsRoot,
    docsSitemap,
    opengraphRoot,
    sitesOpengraph,
    docsTwitter,
    groupedSitesOpengraph,
    groupedAtlasOpengraph,
    iconSvg,
    docsIcon,
  ])('maps %s to %s', (rel, key) => {
    expect(routeKey(rel)).toBe(key);
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
