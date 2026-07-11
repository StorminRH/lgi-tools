// CI presence check (no build required): every route-defining file under
// src/app has a classification entry in scripts/route-classification.json, and
// every classification entry still has a file. The full render-MODE assert
// (assert-route-classification.mjs) needs a `next build` and runs at deploy;
// this lighter check catches an added/removed route that forgot the JSON in
// plain CI, where the build doesn't run. Route keys are derived to match Next's
// App Router paths (no route groups in this app, so the mapping is direct).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { diffRoutes, discoveredKeys, isRouteFile } from './route-presence.mjs';

const APP_DIR = 'src/app';
const CLASSIFICATION_PATH = 'scripts/route-classification.json';

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const routeFiles = walk(APP_DIR).filter((f) => isRouteFile(path.basename(f)));
const discovered = discoveredKeys(routeFiles, APP_DIR);

const classification = JSON.parse(readFileSync(CLASSIFICATION_PATH, 'utf8'));
const classified = new Set(Object.keys(classification.routes ?? {}));

const { missing, stale } = diffRoutes(discovered, classified);

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
