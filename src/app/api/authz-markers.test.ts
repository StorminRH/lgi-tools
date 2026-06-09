import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Mechanical authorization-classification guard. Every route handler under
// src/app/api must self-declare its authorization class on its own comment line:
//
//   // authz: public | auth | admin | cron | service
//
// This asserts ONLY that the marker is present, unique, and well-formed — it does
// NOT verify the route's actual auth logic, and there is deliberately no central
// route→class table (the class lives next to the code that enforces it). A new
// route with no marker fails this test, so an unclassified handler can't ship
// silently — the same spirit as scripts/assert-route-classification.mjs.

const API_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(API_DIR, '..', '..', '..');

const MARKER_RE = /^[ \t]*\/\/[ \t]*authz:[ \t]*([a-z]+)[ \t]*$/gm;
// 'service' = a machine-to-machine caller authenticated by a shared bearer
// secret (e.g. the Convex backend hitting /api/internal/eve-token) — distinct
// from 'cron' (Vercel's cron invoker), which it would otherwise be mislabelled as.
const VALID_CLASSES = new Set(['public', 'auth', 'admin', 'cron', 'service']);

// Recursive walk using withFileTypes only — `fs.globSync` and the `recursive`
// readdir option are absent from the pinned @types/node@20 and would break
// `pnpm typecheck` even though Node 24 runs them.
function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (/^route\.(ts|js|mts|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const ROUTE_FILES = findRouteFiles(API_DIR);
const label = (file: string) => relative(REPO_ROOT, file);

describe('authz classification markers', () => {
  it('finds at least one API route file (guards against a broken glob passing vacuously)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it.each(ROUTE_FILES)('%s declares exactly one valid authz class', (file) => {
    const src = readFileSync(file, 'utf8');
    const matches = [...src.matchAll(MARKER_RE)];

    expect(
      matches.length,
      `${label(file)} has no "// authz:" marker. Every src/app/api/**/route.* file must ` +
        `declare its authorization class on its own comment line, e.g.  // authz: public  ` +
        `(one of: public | auth | admin | cron | service), directly above the exported handler. ` +
        `This is a mechanical presence check — it does not inspect the route's auth logic.`,
    ).toBeGreaterThan(0);

    expect(
      matches.length,
      `${label(file)} has more than one "// authz:" marker. Keep exactly one ` +
        `(delete stale markers after re-classifying).`,
    ).toBeLessThan(2);

    const cls = matches[0][1];
    expect(
      VALID_CLASSES.has(cls),
      `${label(file)} has an invalid authz class "${cls}". ` +
        `Use exactly one of: public | auth | admin | cron | service.`,
    ).toBe(true);
  });
});
