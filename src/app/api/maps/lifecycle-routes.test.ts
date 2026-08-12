import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  deleteMapForUser: vi.fn(),
  restoreMapForUser: vi.fn(),
  requestMapPurgeForUser: vi.fn(),
  checkUserId: vi.fn(),
  logUsageEvent: vi.fn(),
}));

vi.mock('@/composition/map-lifecycle', () => ({
  deleteMapForUser: (...args: unknown[]) => h.deleteMapForUser(...args),
  restoreMapForUser: (...args: unknown[]) => h.restoreMapForUser(...args),
  requestMapPurgeForUser: (...args: unknown[]) => h.requestMapPurgeForUser(...args),
}));
vi.mock('@/platform/auth/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));

import { POST as deleteMap } from './delete/route';
import { POST as purgeMapNow } from './purge-now/route';
import { POST as restoreMap } from './restore/route';

const MAP_ID = '11111111-1111-4111-8111-111111111111';

function request(path: string, body: unknown): Request {
  return new Request(`http://localhost:3000/api/maps/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.deleteMapForUser.mockReset().mockResolvedValue({ ok: true, projectionPending: false });
  h.restoreMapForUser.mockReset().mockResolvedValue({ ok: true, projectionPending: false });
  h.requestMapPurgeForUser.mockReset().mockResolvedValue({ ok: true });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
});

describe('map lifecycle routes', () => {
  it.each([
    ['delete', deleteMap, h.deleteMapForUser],
    ['restore', restoreMap, h.restoreMapForUser],
    ['purge-now', purgeMapNow, h.requestMapPurgeForUser],
  ] as const)('POST /api/maps/%s validates and dispatches one map id', async (path, route, owner) => {
    const response = await route(request(path, { mapId: MAP_ID }));
    expect(response.status).toBe(204);
    expect(owner).toHaveBeenCalledWith('user-1', { mapId: MAP_ID });
  });

  it.each([
    ['delete', deleteMap, h.deleteMapForUser, 'map_admin_required'],
    ['restore', restoreMap, h.restoreMapForUser, 'map_restore_unavailable'],
    ['purge-now', purgeMapNow, h.requestMapPurgeForUser, 'map_creator_required'],
  ] as const)('POST /api/maps/%s returns its declared lifecycle denial', async (path, route, owner, code) => {
    owner.mockResolvedValueOnce({ ok: false });
    const response = await route(request(path, { mapId: MAP_ID }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it('rejects malformed and unauthenticated input before lifecycle work', async () => {
    expect((await deleteMap(request('delete', { mapId: 'not-a-uuid' }))).status).toBe(400);
    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    expect((await restoreMap(request('restore', { mapId: MAP_ID }))).status).toBe(401);
    expect(h.restoreMapForUser).not.toHaveBeenCalled();
  });
});
