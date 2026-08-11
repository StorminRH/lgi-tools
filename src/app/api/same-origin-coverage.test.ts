import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const API_DIR = dirname(fileURLToPath(import.meta.url));

const PIPELINE_MUTATIONS = [
  'account/active-character/route.ts',
  'account/characters/unlink/route.ts',
  'account/corp-structures/rigs/route.ts',
  'account/corp-structures/sharing/route.ts',
  'account/custom-structures/delete/route.ts',
  'account/custom-structures/route.ts',
  'account/custom-structures/set-pin/route.ts',
  'account/custom-structures/set-tax/route.ts',
  'account/purge-character/route.ts',
  'account/saved-plans/delete/route.ts',
  'account/saved-plans/favorite/route.ts',
  'account/saved-plans/rename/route.ts',
  'account/saved-plans/route.ts',
  'account/sessions/revoke/route.ts',
  'admin/characters/unlink/route.ts',
  'admin/sessions/revoke/route.ts',
  'maps/jump/route.ts',
  'maps/signature-elimination/route.ts',
  'preferences/route.ts',
] as const;

const DIRECT_MUTATIONS = [
  'account/delete/route.ts',
  'admin/characters/reassign/route.ts',
  'admin/role/route.ts',
  'feedback/route.ts',
] as const;

const ADMIN_MUTATIONS = [
  'admin/esi-jobs/retry/route.ts',
  'admin/wh-statics/route.ts',
] as const;

const EXEMPT_MUTATIONS = {
  'internal/eve-characters/route.ts': {
    authz: 'service',
    reason: 'service-authenticated internal character enumeration',
  },
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
  'eve/names/route.ts': {
    authz: 'public',
    reason: 'public stateless name resolution',
  },
  'industry/build-location/route.ts': {
    authz: 'public',
    reason: 'public stateless planner computation',
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

function findRouteFiles(dir: string): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...findRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      routes.push(fullPath);
    }
  }
  return routes;
}

describe('same-origin mutation coverage', () => {
  it('classifies every mutating route exactly once', () => {
    const mutatingRoutes = findRouteFiles(API_DIR)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return MUTATING_METHOD_RE.test(source);
      })
      .map((file) => relative(API_DIR, file))
      .sort();
    const classifiedRoutes = [
      ...PIPELINE_MUTATIONS,
      ...DIRECT_MUTATIONS,
      ...ADMIN_MUTATIONS,
      ...Object.keys(EXEMPT_MUTATIONS),
    ];

    expect(PIPELINE_MUTATIONS).toHaveLength(19);
    expect(DIRECT_MUTATIONS).toHaveLength(4);
    expect(ADMIN_MUTATIONS).toHaveLength(2);
    expect(Object.keys(EXEMPT_MUTATIONS)).toHaveLength(12);
    expect(new Set(classifiedRoutes).size).toBe(classifiedRoutes.length);
    expect(mutatingRoutes).toEqual(classifiedRoutes.sort());
  });

  it.each(PIPELINE_MUTATIONS)('%s uses the mutation pipeline', (route) => {
    const source = readFileSync(join(API_DIR, route), 'utf8');

    expect(source).toContain("from '@/app/api/mutation-route';");
    expect(source).toContain('runMutationRoute(request');
  });

  it.each(DIRECT_MUTATIONS)('%s invokes the shared gate directly', (route) => {
    const source = readFileSync(join(API_DIR, route), 'utf8');

    expect(source).toContain(
      "import { requireSameOrigin } from '@/platform/auth/same-origin';",
    );
    expect(source).toContain('const originCheck = requireSameOrigin(request);');
  });

  it.each(ADMIN_MUTATIONS)(
    '%s invokes the shared admin mutation gate',
    (route) => {
      const source = readFileSync(join(API_DIR, route), 'utf8');

      expect(source).toContain(
        "import { checkAdminMutation } from '@/platform/auth/route-guards';",
      );
      expect(source).toContain('const gate = await checkAdminMutation(request);');
    },
  );

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

  it('the mutation pipeline invokes the shared gate', () => {
    const source = readFileSync(join(API_DIR, 'mutation-route.ts'), 'utf8');

    expect(source).toContain(
      "import { requireSameOrigin } from '@/platform/auth/same-origin';",
    );
    expect(source).toContain('const originCheck = requireSameOrigin(request);');
  });
});
