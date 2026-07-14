import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const API_DIR = dirname(fileURLToPath(import.meta.url));

const GUARDED_MUTATIONS = [
  'account/active-character/route.ts',
  'account/characters/unlink/route.ts',
  'account/corp-structures/rigs/route.ts',
  'account/corp-structures/sharing/route.ts',
  'account/custom-structures/delete/route.ts',
  'account/custom-structures/route.ts',
  'account/custom-structures/set-pin/route.ts',
  'account/custom-structures/set-tax/route.ts',
  'account/delete/route.ts',
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
  'feedback/route.ts',
  'preferences/route.ts',
] as const;

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
  it('pins the exact browser-mutation inventory to the shared helper', () => {
    const guardedRoutes = findRouteFiles(API_DIR)
      .filter((file) => readFileSync(file, 'utf8').includes('requireSameOrigin(request);'))
      .map((file) => relative(API_DIR, file))
      .sort();

    expect(guardedRoutes).toEqual([...GUARDED_MUTATIONS].sort());
  });

  it.each(GUARDED_MUTATIONS)('%s imports the shared helper', (route) => {
    const source = readFileSync(join(API_DIR, route), 'utf8');

    expect(source).toContain(
      "import { requireSameOrigin } from '@/features/auth/same-origin';",
    );
  });
});
