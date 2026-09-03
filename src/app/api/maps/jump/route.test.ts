import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  resolveJumpRequest: vi.fn(),
  logUsageEvent: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
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
  it('rejects forged doorbell facts and anonymous callers before resolving, then forwards authenticated bodies', async () => {
    const forged = await POST(
      request({
        kind: 'doorbell',
        mapId: 'map-1',
        characterId: 90_000_001,
        fromSolarSystemId: 31_000_001,
        toSolarSystemId: 31_000_002,
      }),
    );
    expect(forged.status).toBe(400);
    expect(problemBodySchema.parse(await forged.json())).toMatchObject({
      code: 'invalid_body',
    });
    expect(h.resolveJumpRequest).not.toHaveBeenCalled();

    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    const anonymous = await POST(
      request({ kind: 'doorbell', mapId: 'map-1', characterId: 90_000_001 }),
    );
    expect(anonymous.status).toBe(401);
    expect(h.resolveJumpRequest).not.toHaveBeenCalled();

    const body = {
      kind: 'typed-hole' as const,
      mapId: 'map-1',
      connectionId: 'connection-1',
    };
    const ok = await POST(request(body));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
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
