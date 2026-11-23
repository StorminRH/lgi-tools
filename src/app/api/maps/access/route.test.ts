import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  applyMapAccessUpdate: vi.fn(),
  checkUserId: vi.fn(),
}));

vi.mock('@/composition/map-access-update', () => ({
  applyMapAccessUpdate: (...args: unknown[]) => h.applyMapAccessUpdate(...args),
}));
vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
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

function resetMocks(): void {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.applyMapAccessUpdate.mockReset().mockResolvedValue({ ok: true });
}

test('applies every validated operation through the same authority path', async () => {
  resetMocks();
  const principal = { ownerType: 'corporation', ownerId: 99 };
  const block = { operation: 'block', mapId: MAP_ID, characterId: 42 };
  for (const body of [
    UPSERT,
    { operation: 'revoke', mapId: MAP_ID, principal },
    block,
    { ...block, operation: 'unblock' },
  ]) {
    expect((await POST(postJson(ROUTE, body))).status).toBe(204);
    expect(h.applyMapAccessUpdate).toHaveBeenLastCalledWith('user-1', body);
  }
});

test('rejects unauthenticated and malformed requests, including a non-UUID map id, before the access owner', async () => {
  resetMocks();
  h.checkUserId.mockResolvedValueOnce({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });
  expect((await POST(postJson(ROUTE, UPSERT))).status).toBe(401);

  for (const body of [
    { ...UPSERT, grant: { ...UPSERT.grant, ownerId: 0, role: 'owner' } },
    { operation: 'block', mapId: MAP_ID, characterId: 0 },
  ]) {
    expect((await POST(postJson(ROUTE, body))).status).toBe(400);
  }

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

test('answers each access refusal with its status, code and, for conflicts, the message the user reads', async () => {
  resetMocks();
  const block = { operation: 'block', mapId: MAP_ID, characterId: 42 };
  const revokeOwn = {
    operation: 'revoke', mapId: MAP_ID, principal: { ownerType: 'character', ownerId: 7 },
  };
  const cases = [
    { result: { ok: false, reason: 'forbidden' }, body: UPSERT, status: 403, problem: { code: 'map_admin_required' } },
    {
      result: { ok: false, reason: 'creator-character-required' },
      body: revokeOwn,
      status: 409,
      problem: { code: 'map_creator_character_required' },
    },
    {
      result: { ok: false, reason: 'projection-unavailable', cause: new Error('offline') },
      body: UPSERT,
      status: 503,
      problem: { code: 'map_projection_unavailable' },
    },
    {
      result: { ok: false, reason: 'block-owner' },
      body: block,
      status: 409,
      problem: { code: 'map_block_owner', detail: 'This character belongs to the map owner.' },
    },
    {
      result: { ok: false, reason: 'block-self' },
      body: block,
      status: 409,
      problem: { code: 'map_block_self', detail: "You can't block your own character." },
    },
  ];

  for (const { result, body, status, problem } of cases) {
    h.applyMapAccessUpdate.mockReset().mockResolvedValue(result);
    const response = await POST(postJson(ROUTE, body));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject(problem);
  }
});
