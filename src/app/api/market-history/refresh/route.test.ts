import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLiveHistoryMock = vi.fn();
const rateLimitGuardMock = vi.fn();
const emitCostMetricMock = vi.fn();

vi.mock('@/data/market-history/refresh-on-view', () => ({
  getLiveHistory: (...args: unknown[]) => getLiveHistoryMock(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimitGuard: (...args: unknown[]) => rateLimitGuardMock(...args),
}));
vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (...args: unknown[]) => emitCostMetricMock(...args),
}));

import { POST } from './route';

function request(typeIds: number[]): NextRequest {
  return new NextRequest('http://localhost:3000/api/market-history/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ typeIds }),
  });
}

describe('POST /api/market-history/refresh telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitGuardMock.mockResolvedValue({ ok: true });
    getLiveHistoryMock.mockResolvedValue({
      inputs: new Map(),
      degraded: { fetched: 0, budgetExhausted: true },
      metrics: { requested: 1, freshEsi: 0, warmStored: 0, staleStored: 1, missing: 0 },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('records stale-stored history without inventing a fallback source', async () => {
    const response = await POST(request([34]));
    expect(response.status).toBe(200);
    expect(getLiveHistoryMock).toHaveBeenCalledWith([34], expect.any(Function));
    expect(emitCostMetricMock).toHaveBeenCalledWith(
      'market_history_refresh',
      expect.objectContaining({
        freshEsi: 0,
        warmStored: 0,
        staleStored: 1,
        missing: 0,
        budgetExhausted: true,
      }),
    );
    expect(JSON.stringify(emitCostMetricMock.mock.calls)).not.toContain('fuzzwork');
  });
});
