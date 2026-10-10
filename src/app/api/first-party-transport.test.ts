import { describe, expect, it } from 'vitest';
import { filesMatching, listSourceFiles } from '@/lib/__tests__/source-scan';

const TEMPLATE_FETCH_RE = /\b(?:fetch|fetchWithTimeout)\s*\(\s*`[^`]*\/api\//g;

const RESPONSE_ASSERTION_RE = /\.json\(\)\s*\)?\s+as\s+(?!unknown\s*(?:[;,)\]]|$))/gm;

const RESPONSE_ASSERTION_ALLOWLIST = [
  'src/data/gsc/source.ts',
];

// Unlike the vendor sweep, this one keeps declaration files and __fixtures__ in scope.
const PRODUCTION_SOURCES = listSourceFiles({
  roots: ['src', 'convex'],
  extensions: ['.ts', '.tsx'],
  skipDirectories: ['_generated', 'node_modules'],
  skipSuffixes: ['.test.ts', '.test.tsx'],
});

describe('first-party transport sweeps', () => {
  it('scans a non-trivial production surface in both trees', () => {
    expect(PRODUCTION_SOURCES.length).toBeGreaterThan(500);
    expect(
      PRODUCTION_SOURCES.some((file) => file.startsWith('convex/')),
      'the sweep must cover the Convex tree',
    ).toBe(true);
  });

  it('finds no first-party URL assembled in a template literal', () => {
    expect(filesMatching(PRODUCTION_SOURCES, TEMPLATE_FETCH_RE)).toEqual([]);
  });

  it('confines response-type assertions to the pinned external boundaries', () => {
    const found = filesMatching(PRODUCTION_SOURCES, RESPONSE_ASSERTION_RE);
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
