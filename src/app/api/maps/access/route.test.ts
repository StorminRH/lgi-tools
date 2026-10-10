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

import { postJson } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const MAP_ID = '11111111-1111-4111-8111-111111111111';

const UPSERT = {
  operation: 'upsert',
  mapId: MAP_ID,
  grant: { ownerType: 'character', ownerId: 42, role: 'editor' },
};

const ROUTE = '/api/maps/access';

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.applyMapAccessUpdate.mockReset().mockResolvedValue({ ok: true });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/maps/access', () => {
  it('applies validated upsert and revoke through the same authority path', async () => {
    expect((await POST(postJson(ROUTE, UPSERT))).status).toBe(204);
    expect(h.applyMapAccessUpdate).toHaveBeenCalledWith('user-1', UPSERT);

    const revoke = {
      operation: 'revoke',
      mapId: MAP_ID,
      principal: { ownerType: 'corporation', ownerId: 99 },
    };
    expect((await POST(postJson(ROUTE, revoke))).status).toBe(204);
    expect(h.applyMapAccessUpdate).toHaveBeenCalledWith('user-1', revoke);
  });

  it('rejects unauthenticated and malformed requests before the access owner', async () => {
    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    expect((await POST(postJson(ROUTE, UPSERT))).status).toBe(401);

    h.checkUserId.mockResolvedValueOnce({ ok: true, userId: 'user-1' });
    expect(
      (
        await POST(
          postJson(ROUTE, {
            ...UPSERT,
            grant: { ...UPSERT.grant, ownerId: 0, role: 'owner' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(h.applyMapAccessUpdate).not.toHaveBeenCalled();
  });

  it('rejects a map id that is not a UUID as an invalid body before it reaches SQL', async () => {
    const principal = { ownerType: 'character', ownerId: 7 };
    for (const body of [
      { ...UPSERT, mapId: 'map-1' },
      { operation: 'revoke', mapId: 'map-1', principal },
      { operation: 'block', mapId: ` ${MAP_ID} `, characterId: 42 },
      { operation: 'unblock', mapId: MAP_ID.slice(0, -1), characterId: 42 },
    ]) {
      const response = await POST(postJson(ROUTE, body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: 'invalid_body',
        detail: 'mapId: Invalid UUID',
      });
    }
    expect(h.applyMapAccessUpdate).not.toHaveBeenCalled();
  });

  it('returns the declared denial for a non-admin map caller', async () => {
    h.applyMapAccessUpdate.mockResolvedValueOnce({ ok: false, reason: 'forbidden' });

    const response = await POST(postJson(ROUTE, UPSERT));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'map_admin_required' });
  });

  it('refuses to strip the creator of their last own character', async () => {
    h.applyMapAccessUpdate.mockResolvedValueOnce({ ok: false, reason: 'creator-character-required' });

    const response = await POST(postJson(ROUTE, {
      operation: 'revoke', mapId: MAP_ID, principal: { ownerType: 'character', ownerId: 7 },
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'map_creator_character_required' });
  });

  it('surfaces post-commit projection unavailability for an idempotent retry', async () => {
    h.applyMapAccessUpdate.mockResolvedValueOnce({
      ok: false,
      reason: 'projection-unavailable',
      cause: new Error('offline'),
    });

    const response = await POST(postJson(ROUTE, UPSERT));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'map_projection_unavailable',
    });
  });

  it('answers block refusals with their codes and messages, and a successful block with 204', async () => {
    const block = { operation: 'block', mapId: MAP_ID, characterId: 42 };
    expect((await POST(postJson(ROUTE, block))).status).toBe(204);
    expect(h.applyMapAccessUpdate).toHaveBeenCalledWith('user-1', block);
    expect((await POST(postJson(ROUTE, { ...block, operation: 'unblock' }))).status).toBe(204);

    h.applyMapAccessUpdate.mockResolvedValueOnce({ ok: false, reason: 'block-owner' });
    let response = await POST(postJson(ROUTE, block));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'map_block_owner',
      detail: 'This character belongs to the map owner.',
    });

    h.applyMapAccessUpdate.mockResolvedValueOnce({ ok: false, reason: 'block-self' });
    response = await POST(postJson(ROUTE, block));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'map_block_self',
      detail: "You can't block your own character.",
    });

    h.applyMapAccessUpdate.mockResolvedValueOnce({ ok: false, reason: 'forbidden' });
    expect((await POST(postJson(ROUTE, block))).status).toBe(403);
    expect((await POST(postJson(ROUTE, { ...block, characterId: 0 }))).status).toBe(400);
  });
});

