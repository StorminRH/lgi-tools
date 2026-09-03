import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  createProjectedMap: vi.fn(),
  logUsageEvent: vi.fn(),
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
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));

import { POST } from './route';
import {
  MAX_MAP_CREATE_GRANTS,
  MAX_MAP_NAME_LENGTH,
} from '@/data/maps/api-contract';

function request(body: unknown): Request {
  return new Request('http://localhost:3000/api/maps/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: 'Home chain',
  grants: [{ ownerType: 'character', ownerId: 42, role: 'editor' }],
};

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.createProjectedMap.mockReset().mockResolvedValue({ ok: true, mapId: 'map-1' });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
  h.rateLimit.mockReset().mockResolvedValue({ ok: true, remaining: 4 });
});

describe('POST /api/maps/create', () => {
  it('reuses one authenticated identity for preflight and authorization', async () => {
    const response = await POST(request(VALID_BODY));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ mapId: 'map-1' });
    expect(h.checkUserId).toHaveBeenCalledOnce();
    expect(h.rateLimit).toHaveBeenCalledWith('user-1', {
      name: 'map-create',
      perMinute: 5,
    });
    expect(h.createProjectedMap).toHaveBeenCalledWith('user-1', VALID_BODY);
  });

  it('rejects anonymous, blank, and oversized requests before durable creation', async () => {
    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    expect((await POST(request(VALID_BODY))).status).toBe(401);
    expect(h.rateLimit).not.toHaveBeenCalled();

    h.checkUserId.mockResolvedValueOnce({ ok: true, userId: 'user-1' });
    expect((await POST(request({ ...VALID_BODY, name: '   ' }))).status).toBe(400);
    expect(
      (await POST(request({ ...VALID_BODY, name: 'x'.repeat(MAX_MAP_NAME_LENGTH + 1) }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            name: 'Too many grants',
            grants: Array.from({ length: MAX_MAP_CREATE_GRANTS + 1 }, (_, index) => ({
              ownerType: 'character',
              ownerId: index + 1,
              role: 'viewer',
            })),
          }),
        )
      ).status,
    ).toBe(400);
    expect(h.createProjectedMap).not.toHaveBeenCalled();
  });

  it('rate-limits per authenticated user and keeps human-paced peers independent', async () => {
    const counts = new Map<string, number>();
    h.rateLimit.mockImplementation(async (userId: string) => {
      const count = (counts.get(userId) ?? 0) + 1;
      counts.set(userId, count);
      return count <= 5
        ? { ok: true, remaining: 5 - count }
        : { ok: false, retryAfter: 12 };
    });

    const statuses = [];
    for (let index = 0; index < 6; index += 1) {
      statuses.push((await POST(request(VALID_BODY))).status);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect(h.createProjectedMap).toHaveBeenCalledTimes(5);

    h.createProjectedMap.mockClear();
    h.checkUserId
      .mockResolvedValueOnce({ ok: true, userId: 'user-1' })
      .mockResolvedValueOnce({ ok: true, userId: 'user-2' });
    counts.clear();
    expect((await POST(request(VALID_BODY))).status).toBe(201);
    expect((await POST(request(VALID_BODY))).status).toBe(201);
    expect(h.createProjectedMap).toHaveBeenCalledTimes(2);
  });

  it('returns the declared degraded response only after compensated projection failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new Error('projection unavailable');
    h.createProjectedMap.mockResolvedValueOnce({
      ok: false,
      cause,
    });

    expect((await POST(request(VALID_BODY))).status).toBe(503);
    expect(consoleError).toHaveBeenCalledWith('[map] create projection failed', cause);
    consoleError.mockRestore();
  });
});
