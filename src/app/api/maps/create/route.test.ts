import { afterEach, expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  createProjectedMap: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/composition/map-creation', () => ({
  createProjectedMap: (...args: unknown[]) => h.createProjectedMap(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => h.rateLimit(...args),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { POST } from './route';
import {
  MAX_MAP_CREATE_GRANTS,
  MAX_MAP_NAME_LENGTH,
} from '@/data/maps/api-contract';

const MAP_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE = '/api/maps/create';

const VALID_BODY = {
  name: 'Home chain',
  creatorCharacterIds: [7],
  grants: [{ ownerType: 'character', ownerId: 42, role: 'editor' }],
};

function resetMocks(): void {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.createProjectedMap.mockReset().mockResolvedValue({ ok: true, mapId: MAP_ID });
  h.rateLimit.mockReset().mockResolvedValue({ ok: true, remaining: 4 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('creates a map under one authenticated identity, then refuses the same user once the per-user limit trips', async () => {
  resetMocks();
  const response = await POST(postJson(ROUTE, VALID_BODY));

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ mapId: MAP_ID });
  expect(h.checkUserId).toHaveBeenCalledOnce();
  expect(h.rateLimit).toHaveBeenCalledWith('user-1', {
    name: 'map-create',
    perMinute: 5,
  });
  expect(h.createProjectedMap).toHaveBeenCalledWith('user-1', VALID_BODY);

  resetMocks();
  h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 12 });
  expect((await POST(postJson(ROUTE, VALID_BODY))).status).toBe(429);
  expect(h.createProjectedMap).not.toHaveBeenCalled();
});

test('rejects anonymous, blank, oversized and creator-less requests before durable creation', async () => {
  resetMocks();
  h.checkUserId.mockResolvedValueOnce({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });
  expect((await POST(postJson(ROUTE, VALID_BODY))).status).toBe(401);
  expect(h.rateLimit).not.toHaveBeenCalled();

  for (const body of [
    { ...VALID_BODY, name: '   ' },
    { ...VALID_BODY, name: 'x'.repeat(MAX_MAP_NAME_LENGTH + 1) },
    {
      name: 'Too many grants',
      grants: Array.from({ length: MAX_MAP_CREATE_GRANTS + 1 }, (_, index) => ({
        ownerType: 'character',
        ownerId: index + 1,
        role: 'viewer',
      })),
    },
    // Admin is granted only once the map exists.
    { ...VALID_BODY, grants: [{ ownerType: 'character', ownerId: 42, role: 'admin' }] },
    { ...VALID_BODY, creatorCharacterIds: [] },
    { ...VALID_BODY, creatorCharacterIds: [42] },
  ]) {
    expect((await POST(postJson(ROUTE, body))).status).toBe(400);
  }
  expect(h.createProjectedMap).not.toHaveBeenCalled();
});

test('maps an unlinked creator to not_linked and a compensated projection failure to 503', async () => {
  resetMocks();
  h.createProjectedMap.mockResolvedValueOnce({ ok: false, reason: 'unlinked-creator-character' });
  const unlinked = await POST(postJson(ROUTE, { ...VALID_BODY, creatorCharacterIds: [9] }));
  expect(unlinked.status).toBe(400);
  await expect(unlinked.json()).resolves.toMatchObject({ code: 'not_linked' });

  const consoleError = silenceConsolePrefixes('error', ['[map] create projection failed']);
  const cause = new Error('projection unavailable');
  h.createProjectedMap.mockResolvedValueOnce({ ok: false, cause });
  expect((await POST(postJson(ROUTE, VALID_BODY))).status).toBe(503);
  expect(consoleError).toHaveBeenCalledWith('[map] create projection failed', cause);
});
