import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  applyMapAccessUpdate: vi.fn(),
  checkUserId: vi.fn(),
  logUsageEvent: vi.fn(),
}));

vi.mock('@/composition/map-access-update', () => ({
  applyMapAccessUpdate: (...args: unknown[]) => h.applyMapAccessUpdate(...args),
}));
vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));

import { POST } from './route';

const UPSERT = {
  operation: 'upsert',
  mapId: 'map-1',
  grant: { ownerType: 'character', ownerId: 42, role: 'editor' },
};

function request(body: unknown): Request {
  return new Request('http://localhost:3000/api/maps/access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.applyMapAccessUpdate.mockReset().mockResolvedValue({ ok: true });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/maps/access', () => {
  it('applies validated upsert and revoke through the same authority path', async () => {
    expect((await POST(request(UPSERT))).status).toBe(204);
    expect(h.applyMapAccessUpdate).toHaveBeenCalledWith('user-1', UPSERT);

    const revoke = {
      operation: 'revoke',
      mapId: 'map-1',
      principal: { ownerType: 'corporation', ownerId: 99 },
    };
    expect((await POST(request(revoke))).status).toBe(204);
    expect(h.applyMapAccessUpdate).toHaveBeenCalledWith('user-1', revoke);
  });

  it('rejects unauthenticated and malformed requests before the access owner', async () => {
    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    expect((await POST(request(UPSERT))).status).toBe(401);

    h.checkUserId.mockResolvedValueOnce({ ok: true, userId: 'user-1' });
    expect(
      (
        await POST(
          request({
            ...UPSERT,
            grant: { ...UPSERT.grant, ownerId: 0, role: 'owner' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(h.applyMapAccessUpdate).not.toHaveBeenCalled();
  });

  it('returns the declared denial for a non-admin map caller', async () => {
    h.applyMapAccessUpdate.mockResolvedValueOnce({ ok: false, reason: 'forbidden' });

    const response = await POST(request(UPSERT));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'map_admin_required' });
  });

  it('surfaces post-commit projection unavailability for an idempotent retry', async () => {
    h.applyMapAccessUpdate.mockResolvedValueOnce({
      ok: false,
      reason: 'projection-unavailable',
      cause: new Error('offline'),
    });

    const response = await POST(request(UPSERT));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'map_projection_unavailable',
    });
  });
});
