import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { filesMatching, listRouteFiles } from '@/lib/__tests__/source-scan';

const API_DIR = dirname(fileURLToPath(import.meta.url));

const PIPELINE_MUTATIONS = [
  'account/active-character/route.ts',
  'account/characters/unlink/route.ts',
  'account/corp-sharing/route.ts',
  'account/corp-structures/rigs/route.ts',
  'account/custom-structures/delete/route.ts',
  'account/custom-structures/route.ts',
  'account/custom-structures/search/route.ts',
  'account/custom-structures/update/route.ts',
  'account/delete/route.ts',
  'account/industry-profiles/delete/route.ts',
  'account/industry-profiles/duplicate/route.ts',
  'account/industry-profiles/route.ts',
  'account/industry-profiles/update/route.ts',
  'account/purge-character/route.ts',
  'account/saved-plans/delete/route.ts',
  'account/saved-plans/favorite/route.ts',
  'account/saved-plans/rename/route.ts',
  'account/saved-plans/route.ts',
  'account/sessions/revoke/route.ts',
  'admin/characters/reassign/route.ts',
  'admin/characters/unlink/route.ts',
  'admin/role/route.ts',
  'admin/sessions/revoke/route.ts',
  'admin/wh-statics/route.ts',
  'feedback/route.ts',
  'maps/access/route.ts',
  'maps/create/route.ts',
  'maps/delete/route.ts',
  'maps/jump/route.ts',
  'maps/purge-now/route.ts',
  'maps/restore/route.ts',
  'maps/search-characters/route.ts',
  'maps/signature-elimination/route.ts',
  'preferences/route.ts',
  'sync-leave/route.ts',
] as const;

const LOCAL_SYNTHETIC_MUTATIONS = ['dev/synthetic-pilot/route.ts'] as const;

const EXEMPT_MUTATIONS = {
  'internal/eve-token/route.ts': {
    authz: 'service',
    reason: 'service-authenticated internal token vending',
  },
  'market-history/refresh/route.ts': {
    authz: 'public',
    reason: 'rate-limited public read-through refresh',
  },
  'market-prices/refresh/route.ts': {
    authz: 'public',
    reason: 'rate-limited public read-through refresh',
  },
  'eve/type-names/route.ts': {
    authz: 'public',
    reason: 'public stateless type name resolution',
  },
  'eve/names/route.ts': {
    authz: 'public',
    reason: 'public stateless name resolution',
  },
  'industry/cost-indices/route.ts': {
    authz: 'public',
    reason: 'public stateless reference read',
  },
  'account/custom-structures/parse-fit/route.ts': {
    authz: 'auth',
    reason: 'authenticated stateless fit parsing',
  },
  'telemetry/route.ts': {
    authz: 'public',
    reason: 'public telemetry beacon',
  },
  'auth/[...all]/route.ts': {
    authz: 'public',
    reason: 'Better Auth library-owned CSRF protection',
  },
  'industry/owned-assets/route.ts': {
    authz: 'auth',
    reason: 'authenticated personal-data refresh trigger',
  },
  'industry/owned-blueprints/route.ts': {
    authz: 'auth',
    reason: 'authenticated personal-data refresh trigger',
  },
  'industry/skill-levels/route.ts': {
    authz: 'auth',
    reason: 'authenticated personal-data refresh trigger',
  },
} as const;

const MUTATING_METHOD_RE =
  /\bexport\s+(?:(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\b|const\s+(?:POST|PUT|PATCH|DELETE)\b)/;

describe('same-origin mutation coverage', () => {
  it('classifies every mutating route exactly once', () => {
    const mutatingRoutes = filesMatching(listRouteFiles(), MUTATING_METHOD_RE)
      .map((file) => relative('src/app/api', file))
      .sort();
    const classifiedRoutes = [
      ...PIPELINE_MUTATIONS,
      ...LOCAL_SYNTHETIC_MUTATIONS,
      ...Object.keys(EXEMPT_MUTATIONS),
    ];

    expect(new Set(classifiedRoutes).size).toBe(classifiedRoutes.length);
    expect(mutatingRoutes).toEqual(classifiedRoutes.sort());
  });

  it.each(PIPELINE_MUTATIONS)('%s uses the mutation pipeline', (route) => {
    const source = readFileSync(join(API_DIR, route), 'utf8');
    const usesMutationRoute =
      source.includes("from '@/app/api/mutation-route';") && source.includes('runMutationRoute(request');
    const usesLifecycleRoute =
      source.includes("from '@/app/api/maps/lifecycle-route';") &&
      source.includes('runMapLifecycleRoute(request');
    expect(usesMutationRoute || usesLifecycleRoute).toBe(true);
  });

  it.each(LOCAL_SYNTHETIC_MUTATIONS)('%s requires matching localhost origin before reset', (route) => {
    const source = readFileSync(join(API_DIR, route), 'utf8');

    expect(source).toContain("from '@/platform/auth/synthetic-pilot';");
    expect(source).toContain('!canMintSyntheticPilotRequest(request)');
  });

  it.each(Object.entries(EXEMPT_MUTATIONS))(
    '%s records its exemption: $reason',
    (route, exemption) => {
      const source = readFileSync(join(API_DIR, route), 'utf8');

      expect(exemption.reason).not.toHaveLength(0);
      expect(source).toContain(`// authz: ${exemption.authz}`);
      expect(source).not.toContain(
        "from '@/platform/auth/same-origin';",
      );
      expect(source).not.toContain(
        "from '@/app/api/mutation-route';",
      );
    },
  );

  it('keeps the shared mutation and lifecycle gates wired', () => {
    const mutation = readFileSync(join(API_DIR, 'mutation-route.ts'), 'utf8');
    const lifecycle = readFileSync(join(API_DIR, 'maps/lifecycle-route.ts'), 'utf8');

    expect(mutation).toContain(
      "import { requireSameOrigin } from '@/platform/auth/same-origin';",
    );
    expect(mutation).toContain('const originCheck = requireSameOrigin(request);');
    expect(lifecycle).toContain("from '@/app/api/mutation-route';");
    expect(lifecycle).toContain('runMutationRoute(request');
  });
});
