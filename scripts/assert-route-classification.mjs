// Asserts that `next build`'s render mode for every route matches the committed
// expectation in route-classification.json. Runs after `next build` (in
// `vercel-build`) so a route can't silently regress to a more dynamic mode — the
// payoff of the conversion track (3.0.4.8 + 3.0.4.9) that took the site off the
// all-dynamic path.
//
// How a route is classified from build artifacts (no console scraping):
//   - `dynamic` (f): absent from .next/prerender-manifest.json — server-rendered
//     per request (every /api/* route handler, by design).
//   - prerendered: present in the prerender manifest. Then its .next/server/app
//     `.meta` distinguishes:
//       - `partial` (static shell + request-time <Suspense> holes): `.meta` carries
//         a `postponed` payload.
//       - `static` (O): `.meta` has no `postponed` payload.
//
// The `postponed` marker is an internal Next 16 detail; if a future release moves
// it, this check fails loudly and the lookup here is the one place to update.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = join(HERE, '..', '.next');
const APP_DIR = join(NEXT_DIR, 'server', 'app');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const prerenderManifestPath = join(NEXT_DIR, 'prerender-manifest.json');
const appRoutesManifestPath = join(NEXT_DIR, 'app-path-routes-manifest.json');
if (!existsSync(prerenderManifestPath) || !existsSync(appRoutesManifestPath)) {
  console.error('✗ Build artifacts not found — run `next build` before this check.');
  process.exit(1);
}

const expected = readJson(join(HERE, 'route-classification.json')).routes;
const appRoutes = readJson(appRoutesManifestPath); // { "<file>/page": "/route", ... }
const prerender = readJson(prerenderManifestPath);
const prerendered = new Set([
  ...Object.keys(prerender.routes ?? {}),
  ...Object.keys(prerender.dynamicRoutes ?? {}),
]);

function metaPathFor(route) {
  const base = route === '/' ? 'index' : route.replace(/^\//, '');
  return join(APP_DIR, `${base}.meta`);
}

function classify(route) {
  if (!prerendered.has(route)) return 'dynamic';
  const metaPath = metaPathFor(route);
  // Prerendered but no resolvable .meta → report 'partial' so it can't pass as a
  // fully-static O without the evidence.
  if (!existsSync(metaPath)) return 'partial';
  return 'postponed' in readJson(metaPath) ? 'partial' : 'static';
}

// Public routes only — skip Next internals (/_not-found, /_global-error) and /favicon.ico.
const routes = [...new Set(Object.values(appRoutes))]
  .filter((r) => !r.startsWith('/_') && r !== '/favicon.ico')
  .sort();

const errors = [];
for (const route of routes) {
  const actual = classify(route);
  const want = expected[route];
  if (!want) {
    errors.push(`unclassified route "${route}" (built as ${actual}) — add it to scripts/route-classification.json`);
  } else if (actual !== want) {
    errors.push(`"${route}": expected ${want} but built as ${actual}`);
  }
}
for (const route of Object.keys(expected)) {
  if (!routes.includes(route)) {
    errors.push(`stale entry "${route}" in scripts/route-classification.json — route no longer exists`);
  }
}

if (errors.length > 0) {
  console.error('\n✗ Route render-mode classification check failed:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nIf the change is intentional, update scripts/route-classification.json in the same commit.\n');
  process.exit(1);
}

console.log(`✓ Route render-mode classification matches expectation (${routes.length} routes).`);
