import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isNoProgrammaticSurface,
  vendorResilienceRegistry,
  type NoProgrammaticSurface,
  type VendorIntegrationId,
  type VendorResilienceEntry,
  type VendorResiliencePolicy,
} from '@/composition/vendor-resilience-registry';

// Binds src/composition/vendor-resilience-registry.ts to the tree it describes.
// The registry is prose about live behavior, so it can only stay true if
// something checks it: every declared wrapper must exist and export what it
// claims, and every vendor-client construction must sit in a declared home.
//
// Two of the three scans are pinned positive found-sets rather than "zero
// matches outside X" assertions, following the 3.10.2.3 census: a scanner that
// silently stopped matching would otherwise report a clean result while
// checking nothing.
//
// This file is a `.test.ts`, so the source scans below never read its own text.

/** The eight resilience fields every call-surface entry must populate. */
const POLICY_FIELDS: readonly (keyof VendorResiliencePolicy)[] = [
  'wrapper',
  'timeout',
  'retryableErrors',
  'backoff',
  'rateLimit',
  'idempotency',
  'degradation',
  'telemetryFields',
];

/** Every integration id the registry must carry. Duplicated deliberately: a literal list is what catches a silently dropped entry. */
const EXPECTED_INTEGRATIONS: readonly VendorIntegrationId[] = [
  'eve-esi',
  'eve-sso',
  'better-auth',
  'convex',
  'upstash-redis',
  'neon-postgres',
  'vercel-platform',
  'github-tooling',
  'google-search-console',
  'discord-webhooks',
  'fuzzwork',
  'ccp-static-data',
  'eve-news-feed',
  'ccp-image-cdn',
];

/** The one Upstash Redis construction site. */
const REDIS_CONSTRUCTION_SITES = ['src/lib/upstash.ts'];

/** Production postgres-js construction sites, each of which must state its own bound. */
const PRODUCTION_POSTGRES_SITES = [
  'src/db/index.ts',
  'src/scripts/backfill-users-if-empty.ts',
  'src/scripts/check-universe-assets.ts',
  'src/scripts/ingest-sde-if-empty.ts',
  'src/scripts/ingest-sde.ts',
  'src/scripts/migrate.ts',
  'src/scripts/refresh-prices.ts',
  'src/scripts/refresh-sde.ts',
];

/**
 * The test harness is a declared non-production seam: it owns disposable-schema steering for the
 * real-Postgres suites and is outside the explicit-bound requirement.
 */
const TEST_SUPPORT_POSTGRES_SITES = ['src/db/test-support/db-test-harness.ts'];

const SKIPPED_DIRECTORIES = new Set(['node_modules', '__fixtures__', '_generated']);
const SKIPPED_SUFFIXES = ['.test.ts', '.test.tsx', '.d.ts'];

function isScannedSource(fileName: string): boolean {
  if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) return false;
  return !SKIPPED_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

/**
 * Every non-test TypeScript file under the given roots. Unlike the write-site scanner this keeps
 * `test-support`, because the DB harness is one of the declared postgres-js homes.
 */
function collectSources(roots: readonly string[]): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(path);
      } else if (isScannedSource(entry.name)) {
        found.push(path);
      }
    }
  };
  for (const root of roots) walk(root);
  return found.sort();
}

function filesMatching(pattern: RegExp): string[] {
  return collectSources(['src', 'convex']).filter((file) =>
    pattern.test(readFileSync(file, 'utf8')),
  );
}

/** Whether a TypeScript module exports the named symbol, covering the declaration and re-export forms in use. */
function exportsSymbol(source: string, symbol: string): boolean {
  const declared = new RegExp(
    String.raw`export\s+(?:async\s+)?(?:function|const|let|class|type|interface)\s+${symbol}\b`,
  );
  const reExported = new RegExp(String.raw`export\s*(?:type\s*)?\{[^}]*\b${symbol}\b[^}]*\}`, 's');
  return declared.test(source) || reExported.test(source);
}

/**
 * Extracts each `urlopen(...)` call's argument text by balancing parentheses, so a call split
 * across lines is still read whole rather than judged on its first line.
 */
function urlopenCallArguments(source: string): string[] {
  const calls: string[] = [];
  const marker = 'urlopen(';
  for (let index = source.indexOf(marker); index !== -1; index = source.indexOf(marker, index + 1)) {
    let depth = 0;
    let cursor = index + marker.length - 1;
    for (; cursor < source.length; cursor++) {
      const char = source[cursor];
      if (char === '(') depth++;
      else if (char === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(index + marker.length, cursor));
  }
  return calls;
}

/** Whether one policy field carries a real value; `wrapper` is a pair, the other seven are prose. */
function isFieldPopulated(
  policy: VendorResiliencePolicy,
  field: keyof VendorResiliencePolicy,
): boolean {
  if (field === 'wrapper') {
    return policy.wrapper.module.trim() !== '' && policy.wrapper.symbol.trim() !== '';
  }
  return policy[field].trim().length >= 4;
}

/**
 * Reports one entry's completeness problems: an unpopulated field for a call-surface policy, or an
 * absence note too thin to distinguish a recorded decision from an unaudited entry.
 */
function completenessProblems(
  id: VendorIntegrationId,
  entry: VendorResilienceEntry,
): string[] {
  if (isNoProgrammaticSurface(entry)) {
    const absence: NoProgrammaticSurface = entry;
    return absence.fact.trim().length < 40 ? [`${id}: empty absence note`] : [];
  }
  return POLICY_FIELDS.filter((field) => !isFieldPopulated(entry, field)).map(
    (field) => `${id}.${field}`,
  );
}

describe('vendor resilience registry', () => {
  it('carries every integration with complete fields or a recorded absence', () => {
    expect(Object.keys(vendorResilienceRegistry).sort()).toEqual(
      [...EXPECTED_INTEGRATIONS].sort(),
    );

    const incomplete = EXPECTED_INTEGRATIONS.flatMap((id) =>
      completenessProblems(id, vendorResilienceRegistry[id]),
    );
    expect(incomplete).toEqual([]);
  });

  it('declares exactly one integration with no programmatic call surface', () => {
    const absent = EXPECTED_INTEGRATIONS.filter((id) =>
      isNoProgrammaticSurface(vendorResilienceRegistry[id]),
    );
    expect(absent).toEqual(['vercel-platform']);
  });

  it('names a wrapper module that exists and exports the declared symbol', () => {
    const broken: string[] = [];
    for (const id of EXPECTED_INTEGRATIONS) {
      const entry = vendorResilienceRegistry[id];
      if (isNoProgrammaticSurface(entry)) continue;
      const { module, symbol } = entry.wrapper;
      if (!existsSync(module)) {
        broken.push(`${id}: missing module ${module}`);
        continue;
      }
      const source = readFileSync(module, 'utf8');
      const found = module.endsWith('.py')
        ? new RegExp(String.raw`^def\s+${symbol}\(`, 'm').test(source)
        : exportsSymbol(source, symbol);
      if (!found) broken.push(`${id}: ${module} does not export ${symbol}`);
    }
    expect(broken).toEqual([]);
  });
});

describe('vendor client construction sites', () => {
  it('constructs the Upstash Redis client only in its declared wrapper', () => {
    expect(filesMatching(/new Redis\(/)).toEqual(REDIS_CONSTRUCTION_SITES);
  });

  it('constructs postgres-js clients only in declared homes', () => {
    expect(filesMatching(/(?<![\w.])postgres\(/)).toEqual(
      [...PRODUCTION_POSTGRES_SITES, ...TEST_SUPPORT_POSTGRES_SITES].sort(),
    );
  });

  it('states an explicit establishment bound at every production postgres-js site', () => {
    const unbounded = PRODUCTION_POSTGRES_SITES.filter(
      (file) => !readFileSync(file, 'utf8').includes('connect_timeout'),
    );
    expect(unbounded).toEqual([]);
  });

  it('bounds every Neon HTTP query through the driver-global fetch hook', () => {
    const source = readFileSync('src/db/index.ts', 'utf8');
    expect(source).toContain('neonConfig.fetchFunction');
    expect(source).toContain('NEON_HTTP_TIMEOUT_MS = 30_000');
    // Assigned inside the lazy builder, not at module scope: this module must
    // stay import-side-effect-free.
    expect(source.indexOf('function getClient')).toBeLessThan(
      source.indexOf('neonConfig.fetchFunction ='),
    );
  });

  it('keeps the Neon client a single consumer so the driver global stays bounded', () => {
    // `fetchFunction` is a driver global, and both the assignment comment and the
    // registry's neon-postgres entry justify that choice by there being exactly
    // one `neon()` consumer. Pin it: a second consumer would silently inherit
    // this client's bound and make both of those recorded rationales untrue.
    // Requires a non-empty argument list so this matches the construction
    // `neon(url)` and not the bare `neon()` that the rationale comments and the
    // registry's own prose write when referring to it.
    expect(filesMatching(/(?<![\w.])neon\([^)]/)).toEqual(['src/db/index.ts']);
  });

  it('routes outbound HTTP only through the two sanctioned transport modules', () => {
    // The lint rail already rejects a bare `fetch` as you type, so this is not
    // here to catch a new call site. It pins the exemption list itself: widening
    // the rail's `files` array in eslint.config.mjs would let a third module
    // call `fetch` with lint still green, and only this found-set notices.
    // Same reason the two construction inventories above are pinned.
    const callers = filesMatching(/(?<![\w.'"])fetch\(/);
    expect(callers).toEqual(['src/lib/fetch-with-timeout.ts', 'src/transport/api-client.ts']);
  });
});

describe('agent tooling outbound calls', () => {
  it('passes an explicit timeout to every urlopen call', () => {
    const pythonFiles = readdirSync('.agent-local')
      .filter((name) => name.endsWith('.py'))
      .map((name) => `.agent-local/${name}`)
      .sort();
    // A degraded scan that found no Python at all would otherwise pass.
    expect(pythonFiles.length).toBeGreaterThan(0);

    const calls: string[] = [];
    const unbounded: string[] = [];
    for (const file of pythonFiles) {
      for (const args of urlopenCallArguments(readFileSync(file, 'utf8'))) {
        calls.push(file);
        if (!args.includes('timeout=')) unbounded.push(`${file}: ${args.trim()}`);
      }
    }
    expect(calls.length).toBeGreaterThan(0);
    expect(unbounded).toEqual([]);
  });
});
