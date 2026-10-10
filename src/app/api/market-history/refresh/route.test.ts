import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const getLiveHistoryMock = vi.fn();
const checkRateLimitMock = vi.fn();
const emitCostMetricMock = vi.fn();

vi.mock('@/data/market-history/refresh-on-view', () => ({
  getLiveHistory: (...args: unknown[]) => getLiveHistoryMock(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));
vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (...args: unknown[]) => emitCostMetricMock(...args),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/market-history/refresh';

describe('POST /api/market-history/refresh telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({ ok: true });
    getLiveHistoryMock.mockResolvedValue({
      inputs: new Map(),
      degraded: { fetched: 0, budgetExhausted: true },
      metrics: { requested: 1, freshEsi: 0, warmStored: 0, staleStored: 1, missing: 0 },
    });
    silenceConsolePrefixes('warn', ['{"scope":"market-history/refresh",']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records stale-stored history without inventing a fallback source', async () => {
    const response = await POST(postJson(ROUTE, { typeIds: [34] }));
    expect(response.status).toBe(200);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ name: 'market-history-refresh' }),
    );
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
