import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Mechanical API-contract guard (3.4.T) — the sibling of authz-markers.test.ts.
// Every route handler under src/app/api must import from its owning slice's
// api-contract module, where its request schema and response types live, so the
// route and its clients share one wire shape. This asserts ONLY that the import
// is present — the type-level pinning (`satisfies` on payloads, typed apiFetch
// on callers) is what actually catches drift, via `pnpm typecheck`. A new route
// without a contract fails here, so an uncontracted endpoint can't ship silently.

const API_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(API_DIR, '..', '..', '..');

// An import (or export) whose specifier ends in `api-contract`.
const CONTRACT_IMPORT_RE = /from\s+['"][^'"]*api-contract['"]/;

// Routes whose wire shapes are owned by a library, not by us. The better-auth
// catch-all's contract IS the better-auth version in package.json; the two
// endpoints we call directly are hand-pinned in features/auth/api-contract.ts.
const LIBRARY_OWNED = new Set(['auth/[...all]/route.ts']);

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

const ROUTE_FILES = findRouteFiles(API_DIR).filter(
  (file) => !LIBRARY_OWNED.has(relative(API_DIR, file)),
);
const label = (file: string) => relative(REPO_ROOT, file);

describe('api contract imports', () => {
  it('finds at least one API route file (guards against a broken glob passing vacuously)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  it.each(ROUTE_FILES)('%s imports from its slice\'s api-contract module', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(
      CONTRACT_IMPORT_RE.test(src),
      `${label(file)} does not import from an api-contract module. Every src/app/api/**/route.* ` +
        `file must take its request schema (and response types, pinned with \`satisfies\`) from ` +
        `the owning slice's api-contract.ts — see CONTRIBUTING.md, Architecture invariants (validation ` +
        `lives in route handlers). Library-owned routes are allowlisted at the top of this test.`,
    ).toBe(true);
  });
});
