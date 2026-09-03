import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isNoProgrammaticSurface } from '@/composition/__tests__/vendor-resilience-census';
import {
  vendorResilienceRegistry,
  type NoProgrammaticSurface,
  type VendorIntegrationId,
  type VendorResilienceEntry,
  type VendorResiliencePolicy,
} from '@/composition/__tests__/vendor-resilience-registry';

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

const EXPECTED_INTEGRATIONS: readonly VendorIntegrationId[] = [
  'eve-esi',
  'eve-sso',
  'better-auth',
  'convex',
  'upstash-redis',
  'neon-postgres',
  'vercel-platform',
  'github-tooling',
  'linear-issues',
  'google-search-console',
  'discord-webhooks',
  'fuzzwork',
  'ccp-static-data',
  'eve-news-feed',
  'ccp-image-cdn',
  'anoik-statics',
];

const REDIS_CONSTRUCTION_SITES = ['src/lib/upstash.ts'];

/** Production postgres-js construction sites, each of which must state its own bound. */
const PRODUCTION_POSTGRES_SITES = [
  'src/db/index.ts',
  'src/scripts/check-universe-assets.ts',
  'src/scripts/check-wh-statics.ts',
  'src/scripts/ci-sde-seed.ts',
  'src/scripts/ingest-sde.ts',
  'src/scripts/migrate.ts',
  'src/scripts/refresh-prices.ts',
  'src/scripts/refresh-sde.ts',
  'src/scripts/script-runtime.ts',
];

const TEST_SUPPORT_POSTGRES_SITES = ['src/db/__tests__/support/db-test-harness.ts'];

const SKIPPED_DIRECTORIES = new Set(['node_modules', '__fixtures__', '_generated']);
const SKIPPED_SUFFIXES = ['.test.ts', '.test.tsx', '.d.ts'];

function isScannedSource(fileName: string): boolean {
  if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) return false;
  return !SKIPPED_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

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

function exportsSymbol(source: string, symbol: string): boolean {
  const declared = new RegExp(
    String.raw`export\s+(?:async\s+)?(?:function|const|let|class|type|interface)\s+${symbol}\b`,
  );
  const reExported = new RegExp(String.raw`export\s*(?:type\s*)?\{[^}]*\b${symbol}\b[^}]*\}`, 's');
  return declared.test(source) || reExported.test(source);
}

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

function isFieldPopulated(
  policy: VendorResiliencePolicy,
  field: keyof VendorResiliencePolicy,
): boolean {
  if (field === 'wrapper') {
    return policy.wrapper.module.trim() !== '' && policy.wrapper.symbol.trim() !== '';
  }
  return policy[field].trim().length >= 4;
}

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
    expect(source.indexOf('function getClient')).toBeLessThan(
      source.indexOf('neonConfig.fetchFunction ='),
    );
  });

  it('keeps the Neon client a single consumer so the driver global stays bounded', () => {
    expect(filesMatching(/(?<![\w.])neon\([^)]/)).toEqual(['src/db/index.ts']);
  });

  it('routes outbound HTTP only through the two sanctioned transport modules', () => {
    const callers = filesMatching(/(?<![\w.'"])fetch\(/);
    expect(callers).toEqual(['src/lib/fetch-with-timeout.ts', 'src/transport/api-client.ts']);
  });
});

describe('agent tooling outbound calls', () => {
  it('passes an explicit timeout to every urlopen call', () => {
    const pythonFiles: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.py')) pythonFiles.push(path);
      }
    };
    walk('tools');
    pythonFiles.sort();
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
