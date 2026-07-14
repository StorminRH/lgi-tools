import { beforeEach, describe, expect, it, vi } from 'vitest';

const logUsageEventMock = vi.fn();

vi.mock('./queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

import { emitCostMetric, observeCostPromise, startCostTimer } from './cost-metrics';

describe('cost metrics', () => {
  beforeEach(() => {
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('emits through the server-only usage log vocabulary', async () => {
    emitCostMetric('market_price_refresh', { requested: 3 });
    await vi.waitFor(() => expect(logUsageEventMock).toHaveBeenCalledOnce());
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'market_price_refresh',
      metadata: { requested: 3 },
    });
  });

  it('observes a promise without replacing or delaying it', async () => {
    const promise = Promise.resolve('prices');
    const observed = observeCostPromise(
      promise,
      'planner_open_timing',
      { stage: 'pricing' },
      startCostTimer(),
    );
    expect(observed).toBe(promise);
    await expect(observed).resolves.toBe('prices');
    await vi.waitFor(() => expect(logUsageEventMock).toHaveBeenCalledOnce());
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'planner_open_timing',
      metadata: expect.objectContaining({ stage: 'pricing', outcome: 'succeeded' }),
    });
  });
});
