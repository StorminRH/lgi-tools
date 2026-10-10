import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postJson } from '@/lib/__tests__/route-requests';
import { rateLimitedFailure } from '@/lib/failure';

const h = vi.hoisted(() => ({
  resolveEntityNames: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock('@/data/eve-data/entity-names', () => ({
  resolveEntityNames: (...args: unknown[]) => h.resolveEntityNames(...args),
}));
vi.mock('@/data/telemetry/cost-metrics', () => ({ emitCostMetric: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => h.checkRateLimit(...args),
}));

import { POST } from './route';

const ROUTE = '/api/eve/names';

beforeEach(() => {
  h.resolveEntityNames.mockReset().mockResolvedValue({ '7': 'Pilot' });
  h.checkRateLimit.mockReset().mockResolvedValue({ ok: true });
});

describe('POST /api/eve/names', () => {
  it('resolves names for a caller within the limit', async () => {
    const res = await POST(postJson(ROUTE, { ids: [7] }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ names: { '7': 'Pilot' } });
    expect(h.checkRateLimit).toHaveBeenCalledWith(expect.anything(), { name: 'eve-entity-names', perMinute: 60 });
  });

  it('refuses a caller over the limit without asking ESI', async () => {
    h.checkRateLimit.mockResolvedValue({ ok: false, failure: rateLimitedFailure(30) });

    const res = await POST(postJson(ROUTE, { ids: [7] }));

    expect(res.status).toBe(429);
    expect(h.resolveEntityNames).not.toHaveBeenCalled();
  });

  it('rejects a malformed body before spending the limit', async () => {
    const res = await POST(postJson(ROUTE, { ids: [] }));

    expect(res.status).toBe(400);
    expect(h.checkRateLimit).not.toHaveBeenCalled();
  });
});
