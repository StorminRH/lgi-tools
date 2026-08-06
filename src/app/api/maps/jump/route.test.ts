import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  resolveJumpRequest: vi.fn(),
  logUsageEvent: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/composition/jump-resolver/resolver', () => ({
  resolveJumpRequest: (...args: unknown[]) => h.resolveJumpRequest(...args),
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));

import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost:3000/api/maps/jump', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.resolveJumpRequest.mockReset().mockResolvedValue({
    status: 'processed',
    outcome: 'authored',
    emitted: true,
  });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/maps/jump', () => {
  it('rejects a forged doorbell carrying movement facts before any resolver write', async () => {
    const response = await POST(
      request({
        kind: 'doorbell',
        mapId: 'map-1',
        characterId: 90_000_001,
        fromSolarSystemId: 31_000_001,
        toSolarSystemId: 31_000_002,
      }),
    );
    expect(response.status).toBe(400);
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      code: 'invalid_body',
    });
    expect(h.resolveJumpRequest).not.toHaveBeenCalled();
  });

  it('returns 401 before resolving for an anonymous caller', async () => {
    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    const response = await POST(
      request({ kind: 'doorbell', mapId: 'map-1', characterId: 90_000_001 }),
    );
    expect(response.status).toBe(401);
    expect(h.resolveJumpRequest).not.toHaveBeenCalled();
  });

  it('passes only the authenticated user and validated request to composition', async () => {
    const body = {
      kind: 'typed-hole' as const,
      mapId: 'map-1',
      connectionId: 'connection-1',
    };
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'processed',
      outcome: 'authored',
      emitted: true,
    });
    expect(h.resolveJumpRequest).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      body,
    );
  });
});
