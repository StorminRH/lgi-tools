// Pure helpers for the route-presence CI check, extracted import-safe so they're
// unit-tested without walking the real tree. The entry (assert-routes-present.mjs)
// does the fs walk + JSON read + exit; these decide the derived keys and the diff.
import path from 'node:path';

const ROUTE_FILE = /^(page|route)\.(tsx?|jsx?)$/;
const SITEMAP_FILE = /^sitemap\.(tsx?|jsx?)$/;
const ROBOTS_FILE = /^robots\.(tsx?|jsx?)$/;
const SOCIAL_IMAGE_FILE = /^(opengraph-image|twitter-image)\.(tsx?|jsx?)$/;

export function isRouteFile(base) {
  return (
    ROUTE_FILE.test(base) ||
    SITEMAP_FILE.test(base) ||
    ROBOTS_FILE.test(base) ||
    SOCIAL_IMAGE_FILE.test(base)
  );
}

// src/app-relative posix path → the route key the classification JSON uses.
// (No route groups in this app, so the mapping is direct.)
export function routeKey(relPosix) {
  const parts = relPosix.split('/');
  const base = parts.pop();
  const prefix = parts.length ? `/${parts.join('/')}` : '';
  if (SITEMAP_FILE.test(base)) return `${prefix}/sitemap.xml`;
  if (ROBOTS_FILE.test(base)) return `${prefix}/robots.txt`;
  const socialImage = base.match(SOCIAL_IMAGE_FILE);
  if (socialImage) return `${prefix}/${socialImage[1]}`;
  return prefix === '' ? '/' : prefix;
}

// The set of route keys defined by a list of absolute route-file paths.
export function discoveredKeys(routeFiles, appDir) {
  return new Set(
    routeFiles.map((f) => routeKey(path.relative(appDir, f).split(path.sep).join('/'))),
  );
}

// Compares discovered routes against the classification entries both ways.
export function diffRoutes(discovered, classified) {
  const missing = [...discovered].filter((k) => !classified.has(k)).sort();
  const stale = [...classified].filter((k) => !discovered.has(k)).sort();
  return { missing, stale };
}
