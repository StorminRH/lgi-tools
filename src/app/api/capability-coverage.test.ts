import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAPABILITIES } from '@/data/telemetry/capability';
import { listRouteFiles } from '@/lib/__tests__/source-scan';

const EXCLUSIONS = new Map<string, string>([
  [
    'src/app/api/auth/[...all]/route.ts',
    'Better Auth owns its own request lifecycle end to end.',
  ],
  [
    'src/app/api/dev/synthetic-pilot/route.ts',
    'Resets a fixed local test fixture in development. It is unavailable to hosted production users and does not represent product usage.',
  ],
  [
    'src/app/api/internal/eve-token/route.ts',
    'Machine-to-machine; already accounted for by the calling capability.',
  ],
  [
    'src/app/api/telemetry/route.ts',
    'The beacon that writes the telemetry table — instrumenting it would recurse.',
  ],
]);

const postRoutes = listRouteFiles()
  .map((relative) => ({ relative, source: readFileSync(relative, 'utf8') }))
  .filter(({ source }) => /export (async function |function |const )POST\b/.test(source))
  .sort((a, b) => a.relative.localeCompare(b.relative));

function capabilityIdsIn(source: string): string[] {
  return [
    ...[...source.matchAll(/capability: ["']([^"']+)["']/g)],
    ...[...source.matchAll(/\bcapabilityRoute\(\s*["']([^"']+)["']/g)],
    ...[...source.matchAll(/\bmarketRefreshRoute\(\s*["']([^"']+)["']/g)],
  ].map((match) => match[1] ?? '');
}

function isInstrumented(source: string): boolean {
  return (
    source.includes('runMutationRoute')
    || (source.includes("from '@/app/api/maps/lifecycle-route'") && source.includes('runMapLifecycleRoute'))
    || (source.includes("from '@/app/api/market-refresh-route'") && source.includes('marketRefreshRoute'))
    || source.includes('capabilityRoute')
    || source.includes('recordCapabilityOutcome')
  );
}

describe('capability coverage', () => {
  it.each(postRoutes.map(({ relative }) => relative))(
    '%s is instrumented or explicitly excluded',
    (relative) => {
      const route = postRoutes.find((entry) => entry.relative === relative);
      if (!route) throw new Error(`missing route entry for ${relative}`);
      if (EXCLUSIONS.has(relative)) {
        expect(isInstrumented(route.source)).toBe(false);
        return;
      }
      expect(isInstrumented(route.source)).toBe(true);
    },
  );

  it('pins the exclusion allowlist to real POST routes with stated reasons', () => {
    const present = new Set(postRoutes.map(({ relative }) => relative));
    expect([...EXCLUSIONS.keys()].sort()).toEqual([
      'src/app/api/auth/[...all]/route.ts',
      'src/app/api/dev/synthetic-pilot/route.ts',
      'src/app/api/internal/eve-token/route.ts',
      'src/app/api/telemetry/route.ts',
    ]);
    for (const [relative, reason] of EXCLUSIONS) {
      expect(present.has(relative)).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it('names every capability the instrumented routes reference', () => {
    const known = new Set<string>(Object.keys(CAPABILITIES));
    const referenced = new Set<string>();
    for (const { source } of postRoutes) {
      for (const id of capabilityIdsIn(source)) referenced.add(id);
    }

    expect(referenced.size).toBeGreaterThan(0);
    for (const id of referenced) expect(known.has(id)).toBe(true);
  });

  it('gives every POST route a distinct capability', () => {
    const claimed: string[] = [];
    for (const { relative, source } of postRoutes) {
      if (EXCLUSIONS.has(relative)) continue;
      const ids = capabilityIdsIn(source);
      expect(ids).toHaveLength(1);
      claimed.push(...ids);
    }

    expect(claimed).toHaveLength(postRoutes.length - EXCLUSIONS.size);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed).toContain('admin.wh-statics-review');
  });
});
