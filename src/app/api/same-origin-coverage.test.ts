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
  'preferences/route.ts',
] as const;

const DIRECT_MUTATIONS = [
  'account/delete/route.ts',
  'admin/characters/reassign/route.ts',
  'admin/esi-jobs/retry/route.ts',
  'admin/role/route.ts',
  'feedback/route.ts',
] as const;

const GUARDED_MUTATIONS = [...PIPELINE_MUTATIONS, ...DIRECT_MUTATIONS];

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
  it('pins the exact 22-route browser-mutation inventory', () => {
    const guardedRoutes = findRouteFiles(API_DIR)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return (
          source.includes('runMutationRoute(request') ||
          source.includes('requireSameOrigin(request);')
        );
      })
      .map((file) => relative(API_DIR, file))
      .sort();

    expect(GUARDED_MUTATIONS).toHaveLength(22);
    expect(guardedRoutes).toEqual([...GUARDED_MUTATIONS].sort());
  });

  it.each(PIPELINE_MUTATIONS)('%s uses the mutation pipeline', (route) => {
    const source = readFileSync(join(API_DIR, route), 'utf8');

    expect(source).toContain("from '@/app/api/mutation-route';");
    expect(source).toContain('runMutationRoute(request');
  });

  it.each(DIRECT_MUTATIONS)('%s invokes the shared observer directly', (route) => {
    const source = readFileSync(join(API_DIR, route), 'utf8');

    expect(source).toContain(
      "import { requireSameOrigin } from '@/features/auth/same-origin';",
    );
    expect(source).toContain('requireSameOrigin(request);');
  });

  it('the mutation pipeline invokes the shared observer', () => {
    const source = readFileSync(join(API_DIR, 'mutation-route.ts'), 'utf8');

    expect(source).toContain(
      "import { requireSameOrigin } from '@/features/auth/same-origin';",
    );
    expect(source).toContain('requireSameOrigin(request);');
  });
});
