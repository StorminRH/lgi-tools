// CI presence check (no build required): every route-defining file under
// src/app has a classification entry in scripts/route-classification.json, and
// every classification entry still has a file. The full render-MODE assert
// (assert-route-classification.mjs) needs a `next build` and runs at deploy;
// this lighter check catches an added/removed route that forgot the JSON in
// plain CI, where the build doesn't run. Route keys are derived to match Next's
// App Router paths (no route groups in this app, so the mapping is direct).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const APP_DIR = 'src/app';
const CLASSIFICATION_PATH = 'scripts/route-classification.json';

const ROUTE_FILE = /^(page|route)\.(tsx?|jsx?)$/;
const SITEMAP_FILE = /^sitemap\.(tsx?|jsx?)$/;
const ROBOTS_FILE = /^robots\.(tsx?|jsx?)$/;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

// src/app-relative posix path → the route key the classification JSON uses.
function routeKey(relPosix) {
  const parts = relPosix.split('/');
  const base = parts.pop();
  const prefix = parts.length ? `/${parts.join('/')}` : '';
  if (SITEMAP_FILE.test(base)) return `${prefix}/sitemap.xml`;
  if (ROBOTS_FILE.test(base)) return `${prefix}/robots.txt`;
  return prefix === '' ? '/' : prefix;
}

const routeFiles = walk(APP_DIR).filter((f) => {
  const base = path.basename(f);
  return ROUTE_FILE.test(base) || SITEMAP_FILE.test(base) || ROBOTS_FILE.test(base);
});

const discovered = new Set(
  routeFiles.map((f) => routeKey(path.relative(APP_DIR, f).split(path.sep).join('/'))),
);

const classification = JSON.parse(readFileSync(CLASSIFICATION_PATH, 'utf8'));
const classified = new Set(Object.keys(classification.routes ?? {}));

const missing = [...discovered].filter((k) => !classified.has(k)).sort();
const stale = [...classified].filter((k) => !discovered.has(k)).sort();

if (missing.length || stale.length) {
  if (missing.length) {
    console.error(`✗ ${missing.length} route(s) under ${APP_DIR} missing from ${CLASSIFICATION_PATH}:`);
    for (const k of missing) console.error(`    ${k}`);
  }
  if (stale.length) {
    console.error(`✗ ${stale.length} entry(ies) in ${CLASSIFICATION_PATH} with no route file:`);
    for (const k of stale) console.error(`    ${k}`);
  }
  console.error(`\nAdd new routes to (and remove deleted ones from) ${CLASSIFICATION_PATH} in the same change.`);
  process.exit(1);
}

console.log(`✓ all ${discovered.size} routes present in ${CLASSIFICATION_PATH}`);
