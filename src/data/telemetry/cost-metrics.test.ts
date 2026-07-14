import { beforeEach, describe, expect, it, vi } from 'vitest';

const logUsageEventMock = vi.fn();
const afterMock = vi.fn();

vi.mock('./queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));
vi.mock('next/server', () => ({ after: (callback: () => unknown) => afterMock(callback) }));

import { emitCostMetric, observeCostPromise, startCostTimer } from './cost-metrics';

describe('cost metrics', () => {
  beforeEach(() => {
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    afterMock.mockReset();
  });

  it('keeps the invocation alive while the usage event is written', async () => {
    emitCostMetric('market_price_refresh', { requested: 3 });
    expect(logUsageEventMock).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledOnce();

    await afterMock.mock.calls[0]![0]();

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
    await vi.waitFor(() => expect(afterMock).toHaveBeenCalledOnce());
    await afterMock.mock.calls[0]![0]();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'planner_open_timing',
      metadata: expect.objectContaining({ stage: 'pricing', outcome: 'succeeded' }),
    });
  });

  it('falls back to a direct contained write when lifecycle scheduling is unavailable', async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error('outside request scope');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => emitCostMetric('market_price_refresh', { requested: 1 })).not.toThrow();
    await vi.waitFor(() => expect(logUsageEventMock).toHaveBeenCalledOnce());
  });
});
