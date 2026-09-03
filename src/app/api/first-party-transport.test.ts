import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const API_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(API_DIR, '..', '..');
const REPO_ROOT = join(SRC_DIR, '..');
const CONVEX_DIR = join(REPO_ROOT, 'convex');

const TEMPLATE_FETCH_RE = /\b(?:fetch|fetchWithTimeout)\s*\(\s*`[^`]*\/api\//g;

const RESPONSE_ASSERTION_RE = /\.json\(\)\s*\)?\s+as\s+(?!unknown\s*(?:[;,)\]]|$))/gm;

const RESPONSE_ASSERTION_ALLOWLIST = [
  'src/data/eve-data/station-names.ts',
  'src/data/gsc/source.ts',
];

function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_generated' || entry.name === 'node_modules') continue;
      out.push(...productionSources(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spike\.test)\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

const PRODUCTION_SOURCES = [...productionSources(SRC_DIR), ...productionSources(CONVEX_DIR)];

function filesMatching(pattern: RegExp): string[] {
  return PRODUCTION_SOURCES.filter((file) => {
    pattern.lastIndex = 0;
    return pattern.test(readFileSync(file, 'utf8'));
  }).map((file) => relative(REPO_ROOT, file).split('\\').join('/'));
}

describe('first-party transport sweeps', () => {
  it('scans a non-trivial production surface in both trees', () => {
    expect(PRODUCTION_SOURCES.length).toBeGreaterThan(500);
    expect(
      PRODUCTION_SOURCES.some((file) => file.startsWith(CONVEX_DIR)),
      'the sweep must cover the Convex tree',
    ).toBe(true);
  });

  it('finds no first-party URL assembled in a template literal', () => {
    expect(filesMatching(TEMPLATE_FETCH_RE)).toEqual([]);
  });

  it('confines response-type assertions to the pinned external boundaries', () => {
    const found = filesMatching(RESPONSE_ASSERTION_RE);
    expect([...found].sort()).toEqual([...RESPONSE_ASSERTION_ALLOWLIST].sort());
    expect(found).toHaveLength(RESPONSE_ASSERTION_ALLOWLIST.length);
  });
});

describe('sweep gate red fixtures', () => {
  const matches = (pattern: RegExp, source: string): boolean => {
    pattern.lastIndex = 0;
    return pattern.test(source);
  };

  it.each([
    ['interpolated base URL', 'await fetch(`${base}/api/sites`);'],
    ['interpolated path segment', 'await fetch(`/api/sites/${id}`);'],
    ['timeout wrapper', 'await fetchWithTimeout(`${env.siteUrl}/api/internal/eve-token`, init);'],
    ['whitespace before the argument', 'fetch(\n  `${base}/api/sites`,\n);'],
  ])('rejects a template-literal first-party fetch: %s', (_label, source) => {
    expect(matches(TEMPLATE_FETCH_RE, source)).toBe(true);
  });

  it.each([
    ['contract-executed call', 'await fetch(url, init);'],
    ['third-party template literal', 'await fetch(`${esiBase}/v1/characters/${id}/`);'],
    ['static first-party literal is ESLint-owned', "await fetch('/api/sites');"],
  ])('accepts %s', (_label, source) => {
    expect(matches(TEMPLATE_FETCH_RE, source)).toBe(false);
  });

  it.each([
    ['parenthesised await', 'const body = (await res.json()) as { id: number };'],
    ['direct call', 'const body = await res.json() as { id: number };'],
    ['interface assertion', 'const token = (await response.json()) as EveTokenOkResponse;'],
    ['double assertion', 'const t = (await res.json()) as unknown as EveTokenOkResponse;'],
    ['double assertion, no parens', 'const t = await res.json() as unknown as Shape;'],
  ])('rejects a first-party response assertion: %s', (_label, source) => {
    expect(matches(RESPONSE_ASSERTION_RE, source)).toBe(true);
  });

  it.each([
    ['sanctioned unknown widening', 'const body = (await res.json()) as unknown;'],
    ['unknown widening in a call argument', 'handle((await res.json()) as unknown);'],
    ['unknown widening at end of line', 'const body = (await res.json()) as unknown'],
    ['validated body', 'const body = schema.safeParse(await res.json());'],
    ['plain read', 'const body: unknown = await res.json();'],
  ])('accepts %s', (_label, source) => {
    expect(matches(RESPONSE_ASSERTION_RE, source)).toBe(false);
  });
});
