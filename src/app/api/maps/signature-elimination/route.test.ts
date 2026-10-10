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

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const MAP_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE = '/api/maps/signature-elimination';

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.resolveSignatureElimination.mockReset().mockResolvedValue({
    results: [{ systemId: 31_000_001, status: 'statics-unavailable' }],
  });
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/maps/signature-elimination', () => {
  it('rejects the retired single-system body', async () => {
    expect((await POST(postJson(ROUTE, { mapId: MAP_ID, systemId: 31_000_001 }))).status).toBe(400);
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();
  });

  it('rejects malformed and anonymous requests before dispatching', async () => {
    const malformed = await POST(postJson(ROUTE, { mapId: MAP_ID, systemIds: [-1] }));
    expect(malformed.status).toBe(400);
    expect(problemBodySchema.parse(await malformed.json())).toMatchObject({
      code: 'invalid_body',
    });
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();

    const tooMany = await POST(postJson(ROUTE, {
      mapId: MAP_ID,
      systemIds: [31_000_001, 31_000_002, 31_000_003],
    }));
    expect(tooMany.status).toBe(400);

    const duplicated = await POST(postJson(ROUTE, {
      mapId: MAP_ID,
      systemIds: [31_000_001, 31_000_001],
    }));
    expect(duplicated.status).toBe(400);
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();

    h.checkUserId.mockResolvedValueOnce({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    const anonymous = await POST(postJson(ROUTE, { mapId: MAP_ID, systemIds: [31_000_001] }));
    expect(anonymous.status).toBe(401);
    expect(h.resolveSignatureElimination).not.toHaveBeenCalled();
  });

  it.each(['statics-unavailable', 'observations-unavailable'])(
    'forwards only validated identifiers and preserves %s results', async (status) => {
      h.resolveSignatureElimination.mockResolvedValueOnce({
        results: [{ systemId: 31_000_001, status }],
      });
      const body = { mapId: MAP_ID, systemIds: [31_000_001] };
      const response = await POST(postJson(ROUTE, body));
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
