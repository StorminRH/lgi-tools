import path from 'node:path';

import { normalizeMetadataRoute } from 'next/dist/lib/metadata/get-metadata-route.js';

const ROUTE_FILE = /^(page|route)\.(tsx?|jsx?)$/;
const SITEMAP_FILE = /^sitemap\.(tsx?|jsx?)$/;
const ROBOTS_FILE = /^robots\.(tsx?|jsx?)$/;
const SOCIAL_IMAGE_FILE = /^(opengraph-image|twitter-image)\.(tsx?|jsx?)$/;

const STATIC_ICON_FILE = /^icon\d?\.(ico|jpg|jpeg|png|svg)$/;

export function isRouteFile(base) {
  return (
    ROUTE_FILE.test(base) ||
    SITEMAP_FILE.test(base) ||
    ROBOTS_FILE.test(base) ||
    SOCIAL_IMAGE_FILE.test(base) ||
    STATIC_ICON_FILE.test(base)
  );
}

const withoutGroups = (parts) => parts.filter((part) => !/^\(.+\)$/.test(part));

function routeKey(relPosix) {
  const parts = relPosix.split('/');
  const base = parts.pop();
  const routeParts = withoutGroups(parts);
  const prefix = routeParts.length ? `/${routeParts.join('/')}` : '';
  if (SITEMAP_FILE.test(base)) return `${prefix}/sitemap.xml`;
  if (ROBOTS_FILE.test(base)) return `${prefix}/robots.txt`;
  const socialImage = base.match(SOCIAL_IMAGE_FILE);
  if (socialImage) {

    const built = normalizeMetadataRoute(
      `/${[...parts, socialImage[1]].join('/')}`,
    ).replace(/\/route$/, '');
    return `/${withoutGroups(built.split('/').filter(Boolean)).join('/')}`;
  }

  if (STATIC_ICON_FILE.test(base)) return `${prefix}/${base}`;
  return prefix === '' ? '/' : prefix;
}

export function discoveredKeys(routeFiles, appDir) {
  return new Set(
    routeFiles.map((f) => routeKey(path.relative(appDir, f).split(path.sep).join('/'))),
  );
}

export function diffRoutes(discovered, classified) {
  const missing = [...discovered].filter((k) => !classified.has(k)).sort();
  const stale = [...classified].filter((k) => !discovered.has(k)).sort();
  return { missing, stale };
}
