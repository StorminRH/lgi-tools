import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const logUsageEventMock = vi.fn();
const afterMock = vi.fn();

vi.mock('./log', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));
vi.mock('next/server', () => ({ after: (callback: () => unknown) => afterMock(callback) }));

import {
  elapsedCostTimer,
  emitCostMetric,
  observeCostPromise,
  recordCostMetric,
  startCostTimer,
} from './cost-metrics';

describe('cost metrics', () => {
  beforeEach(() => {
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    afterMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('measures duration with the prerender-safe monotonic clock', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(145);
    const wallClock = vi.spyOn(Date, 'now');

    expect(elapsedCostTimer(startCostTimer())).toBe(45);
    expect(wallClock).not.toHaveBeenCalled();
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

  it('adds result metadata to the succeeded event and leaves it off the failed one', async () => {
    const countRows = (rows: string[]) => ({ returned: rows.length });

    await observeCostPromise(
      Promise.resolve(['a', 'b']),
      'owned_data_read',
      { endpoint: '/api/account/board' },
      startCostTimer(),
      countRows,
    );
    const error = new Error('read failed');
    await expect(
      observeCostPromise(
        Promise.reject<string[]>(error),
        'owned_data_read',
        { endpoint: '/api/account/board' },
        startCostTimer(),
        countRows,
      ),
    ).rejects.toBe(error);

    expect(afterMock).toHaveBeenCalledTimes(2);
    await afterMock.mock.calls[0]![0]();
    await afterMock.mock.calls[1]![0]();
    expect(logUsageEventMock.mock.calls).toEqual([
      [
        {
          action: 'owned_data_read',
          metadata: {
            endpoint: '/api/account/board',
            returned: 2,
            outcome: 'succeeded',
            durationMs: expect.any(Number),
          },
        },
      ],
      [
        {
          action: 'owned_data_read',
          metadata: { endpoint: '/api/account/board', outcome: 'failed', durationMs: expect.any(Number) },
        },
      ],
    ]);
  });

  it('still records the succeeded event when the result metadata hook throws', async () => {
    const logged = silenceConsolePrefixes('error', ['[cost-metrics] result metadata failed']);
    const hookError = new Error('unexpected shape');

    await expect(
      observeCostPromise(
        Promise.resolve('value'),
        'owned_data_read',
        { endpoint: '/api/account/board' },
        startCostTimer(),
        () => {
          throw hookError;
        },
      ),
    ).resolves.toBe('value');

    expect(afterMock).toHaveBeenCalledOnce();
    await afterMock.mock.calls[0]![0]();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'owned_data_read',
      metadata: { endpoint: '/api/account/board', outcome: 'succeeded', durationMs: expect.any(Number) },
    });
    expect(logged).toHaveBeenCalledWith('[cost-metrics] result metadata failed', hookError);
  });

  it('does not detach a write when lifecycle scheduling is unavailable', () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error('outside request scope');
    });
    silenceConsolePrefixes('error', ['[cost-metrics] telemetry scheduling failed']);

    expect(() => emitCostMetric('market_price_refresh', { requested: 1 })).not.toThrow();
    expect(logUsageEventMock).not.toHaveBeenCalled();
  });

  it('provides an awaitable writer for non-request lifecycle owners', async () => {
    await recordCostMetric('neon_cold_start_retry', { outcome: 'recovered' });
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'neon_cold_start_retry',
      metadata: { outcome: 'recovered' },
    });
  });
});
