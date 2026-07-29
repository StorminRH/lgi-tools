// Pure helpers for the route-presence CI check, extracted import-safe so they're
// unit-tested without walking the real tree. The entry (assert-routes-present.mjs)
// does the fs walk + JSON read + exit; these decide the derived keys and the diff.
import path from 'node:path';

const ROUTE_FILE = /^(page|route)\.(tsx?|jsx?)$/;
const SITEMAP_FILE = /^sitemap\.(tsx?|jsx?)$/;
const ROBOTS_FILE = /^robots\.(tsx?|jsx?)$/;
const SOCIAL_IMAGE_FILE = /^(opengraph-image|twitter-image)\.(tsx?|jsx?)$/;
// A literal icon image is route-defining even though it is an asset, not code:
// Next serves it at its own filename, so it reaches the build manifest and needs
// a classification entry like any other route. favicon.ico is deliberately not
// here — assert-route-classification.mjs filters it out of the build check, so it
// has no entry for this walker to match and discovering it would report a false
// missing route.
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

// src/app-relative posix path → the route key the classification JSON uses.
export function routeKey(relPosix) {
  const parts = relPosix.split('/');
  const base = parts.pop();
  const routeParts = parts.filter((part) => !/^\(.+\)$/.test(part));
  const prefix = routeParts.length ? `/${routeParts.join('/')}` : '';
  if (SITEMAP_FILE.test(base)) return `${prefix}/sitemap.xml`;
  if (ROBOTS_FILE.test(base)) return `${prefix}/robots.txt`;
  const socialImage = base.match(SOCIAL_IMAGE_FILE);
  if (socialImage) return `${prefix}/${socialImage[1]}`;
  // Icon images keep their extension in the served path (/icon.svg), unlike the
  // social images above, which drop theirs.
  if (STATIC_ICON_FILE.test(base)) return `${prefix}/${base}`;
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
