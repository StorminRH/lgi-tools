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
    results: [{ systemId: 31_000_001, status: 'statics-unavailable' }],
  });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/maps/signature-elimination', () => {
  it.each([
    { status: 'applied', signatureIds: ['ABC-123'] },
    { status: 'quiet' },
    { status: 'statics-unavailable' },
  ])('preserves the legacy response $status for already-open tabs', async (result) => {
    h.resolveSignatureElimination.mockResolvedValueOnce({
      results: [{ systemId: 31_000_001, ...result }],
    });
    const response = await POST(request({ mapId: 'map-1', systemId: 31_000_001 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(h.resolveSignatureElimination).toHaveBeenCalledWith(
      expect.anything(), 'user-1', { mapId: 'map-1', systemIds: [31_000_001] },
    );
  });

  it('reports unavailable observations as a problem for legacy clients', async () => {
    h.resolveSignatureElimination.mockResolvedValueOnce({
      results: [{ systemId: 31_000_001, status: 'observations-unavailable' }],
    });
    const response = await POST(request({ mapId: 'map-1', systemId: 31_000_001 }));
    expect(response.status).toBe(503);
    expect(problemBodySchema.parse(await response.json())).toMatchObject({
      code: 'observations_unavailable',
    });
  });

  it.each([
    { mapId: 'map-1', systemId: -1 },
    { mapId: 'map-1', systemId: 31_000_001, systemIds: [31_000_001] },
    { mapId: 'map-1', systemId: 31_000_001, extra: true },
  ])('rejects invalid or mixed legacy bodies before dispatch', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();
  });

  it('requires authentication for legacy requests', async () => {
    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    expect((await POST(request({ mapId: 'map-1', systemId: 31_000_001 }))).status).toBe(401);
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();
  });

  it('rejects malformed and anonymous requests before dispatching', async () => {
    const malformed = await POST(request({ mapId: 'map-1', systemIds: [-1] }));
    expect(malformed.status).toBe(400);
    expect(problemBodySchema.parse(await malformed.json())).toMatchObject({
      code: 'invalid_body',
    });
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();

    const tooMany = await POST(request({
      mapId: 'map-1',
      systemIds: [31_000_001, 31_000_002, 31_000_003],
    }));
    expect(tooMany.status).toBe(400);

    const duplicated = await POST(request({
      mapId: 'map-1',
      systemIds: [31_000_001, 31_000_001],
    }));
    expect(duplicated.status).toBe(400);
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();

    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    const anonymous = await POST(request({ mapId: 'map-1', systemIds: [31_000_001] }));
    expect(anonymous.status).toBe(401);
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();
  });

  it.each(['statics-unavailable', 'observations-unavailable'])(
    'forwards only validated identifiers and preserves %s results', async (status) => {
      h.resolveSignatureElimination.mockResolvedValueOnce({
        results: [{ systemId: 31_000_001, status }],
      });
      const body = { mapId: 'map-1', systemIds: [31_000_001] };
      const response = await POST(request(body));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        results: [{ systemId: 31_000_001, status }],
      });
      expect(h.resolveSignatureElimination).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        body,
      );
    },
  );
});
