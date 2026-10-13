import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyRoute } from './route-classification.mjs';

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
const appRoutes = readJson(appRoutesManifestPath);
const prerender = readJson(prerenderManifestPath);

function metaFor(route) {
  const base = route === '/' ? 'index' : route.replace(/^\//, '');
  const metaPath = join(APP_DIR, `${base}.meta`);
  return existsSync(metaPath) ? readJson(metaPath) : undefined;
}

const routes = [...new Set(Object.values(appRoutes))]
  .filter((r) => !r.startsWith('/_') && r !== '/favicon.ico')
  .sort();

const errors = [];
for (const route of routes) {
  const actual = classifyRoute({ route, prerender, metaFor });
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
