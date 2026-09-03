import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const API_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(API_DIR, '..', '..', '..');

const MARKER_RE = /^[ \t]*\/\/[ \t]*authz:[ \t]*([a-z]+)[ \t]*$/gm;
const VALID_CLASSES = new Set(['public', 'auth', 'admin', 'cron', 'service']);

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

    const cls = matches[0]![1]!;
    expect(
      VALID_CLASSES.has(cls),
      `${label(file)} has an invalid authz class "${cls}". ` +
        `Use exactly one of: public | auth | admin | cron | service.`,
    ).toBe(true);
  });
});
