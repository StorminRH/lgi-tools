import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  resolveSignatureElimination: vi.fn(),
  logUsageEvent: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/composition/signature-elimination/resolver', () => ({
  resolveSignatureElimination: (...args: unknown[]) =>
    h.resolveSignatureElimination(...args),
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));

import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

function request(body: unknown): Request {
  return new Request('http://localhost:3000/api/maps/signature-elimination', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.resolveSignatureElimination.mockReset().mockResolvedValue({
    status: 'statics-unavailable',
  });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/maps/signature-elimination', () => {
  it('rejects malformed and anonymous requests before dispatching', async () => {
    const malformed = await POST(request({ mapId: 'map-1', systemId: -1 }));
    expect(malformed.status).toBe(400);
    expect(problemBodySchema.parse(await malformed.json())).toMatchObject({
      code: 'invalid_body',
    });
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();

    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    const anonymous = await POST(request({ mapId: 'map-1', systemId: 31_000_001 }));
    expect(anonymous.status).toBe(401);
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();
  });

  it('forwards only validated identifiers and preserves degraded results', async () => {
    const body = { mapId: 'map-1', systemId: 31_000_001 };
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'statics-unavailable' });
    expect(h.resolveSignatureElimination).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      body,
    );
  });
});
