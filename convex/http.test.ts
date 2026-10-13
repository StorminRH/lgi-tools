// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest';
import http from './http';
import { CONVEX_DOORS, CONVEX_ONLY_PATHS } from './__tests__/http.setup';

describe('Convex HTTP router', () => {
  it('routes every door Next calls as POST', () => {
    for (const door of CONVEX_DOORS) {
      expect(http.lookup(door.path, 'POST'), door.path).not.toBeNull();
    }
  });

  it('routes nothing but the door paths and the Convex-only paths', () => {
    const routed = http.getRoutes().map(([path, method]) => `${method} ${path}`);
    const declared = new Set<string>([...CONVEX_DOORS.map((door) => door.path), ...CONVEX_ONLY_PATHS]);
    expect(routed.sort()).toEqual([...declared].map((path) => `POST ${path}`).sort());
  });
});
