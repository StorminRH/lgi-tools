import { expect, test, vi } from 'vitest';
import {
  capabilityOutcomeMock,
  recordedCapabilityOutcomes,
} from '@/lib/__tests__/capability-outcomes';

const emitCostMetricMock = capabilityOutcomeMock();

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  resolveSignatureElimination: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/composition/signature-elimination/resolver', () => ({
  resolveSignatureElimination: (...args: unknown[]) =>
    h.resolveSignatureElimination(...args),
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (action: string, metadata: Record<string, unknown>) =>
    emitCostMetricMock(action, metadata),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const MAP_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE = '/api/maps/signature-elimination';

function resetMocks() {
  emitCostMetricMock.mockReset();
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.resolveSignatureElimination.mockReset().mockResolvedValue({
    results: [{ systemId: 31_000_001, status: 'statics-unavailable' }],
  });
}

test('POST /api/maps/signature-elimination rejects retired, malformed and anonymous requests before dispatching', async () => {
  resetMocks();
  // Old clients still send the retired single-system body.
  expect((await POST(postJson(ROUTE, { mapId: MAP_ID, systemId: 31_000_001 }))).status).toBe(400);

  const malformed = await POST(postJson(ROUTE, { mapId: MAP_ID, systemIds: [-1] }));
  expect(malformed.status).toBe(400);
  expect(problemBodySchema.parse(await malformed.json())).toMatchObject({
    code: 'invalid_body',
  });

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

test.each(['statics-unavailable', 'observations-unavailable'])(
  'POST /api/maps/signature-elimination forwards only validated identifiers and preserves %s results', async (status) => {
    resetMocks();
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

test('POST /api/maps/signature-elimination records a failure the client gave up on, since its timer showed it to the user', async () => {
  resetMocks();
  const controller = new AbortController();
  h.resolveSignatureElimination.mockImplementationOnce(async () => {
    controller.abort();
    throw new Error('resolver timed out');
  });

  const request = postJson(ROUTE, { mapId: MAP_ID, systemIds: [31_000_001] }, { signal: controller.signal });

  await expect(POST(request)).rejects.toThrow('resolver timed out');
  expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([
    expect.objectContaining({ outcome: 'unexpected' }),
  ]);
});
