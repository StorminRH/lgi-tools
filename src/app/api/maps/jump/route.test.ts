import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  capabilityOutcomeMock,
  recordedCapabilityOutcomes,
} from '@/lib/__tests__/capability-outcomes';

const emitCostMetricMock = capabilityOutcomeMock();

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  resolveJumpRequest: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/composition/jump-resolver/resolver', () => ({
  resolveJumpRequest: (...args: unknown[]) => h.resolveJumpRequest(...args),
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (action: string, metadata: Record<string, unknown>) =>
    emitCostMetricMock(action, metadata),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const MAP_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE = '/api/maps/jump';

beforeEach(() => {
  emitCostMetricMock.mockReset();
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.resolveJumpRequest.mockReset().mockResolvedValue({
    status: 'processed',
    outcome: 'authored',
    emitted: true,
  });
});

describe('POST /api/maps/jump', () => {
  it('rejects forged doorbell facts and anonymous callers before resolving, then forwards authenticated bodies', async () => {
    const forged = await POST(
      postJson(ROUTE, {
        kind: 'doorbell',
        mapId: MAP_ID,
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
      postJson(ROUTE, { kind: 'doorbell', mapId: MAP_ID, characterId: 90_000_001 }),
    );
    expect(anonymous.status).toBe(401);
    expect(h.resolveJumpRequest).not.toHaveBeenCalled();

    const body = {
      kind: 'typed-hole' as const,
      mapId: MAP_ID,
      connectionId: 'connection-1',
    };
    const ok = await POST(postJson(ROUTE, body));
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

  it('records a failure the client gave up on, since its timer showed it to the user', async () => {
    const controller = new AbortController();
    h.resolveJumpRequest.mockImplementationOnce(async () => {
      controller.abort();
      throw new Error('resolver timed out');
    });

    const request = postJson(ROUTE, { kind: 'typed-hole', mapId: MAP_ID, connectionId: 'connection-1' }, { signal: controller.signal });

    await expect(POST(request)).rejects.toThrow('resolver timed out');
    expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([
      expect.objectContaining({ outcome: 'unexpected' }),
    ]);
  });
});
