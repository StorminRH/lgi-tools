import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitCostMetricMock = vi.fn();

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (...args: unknown[]) => emitCostMetricMock(...args),
}));

import { measureOwnedDataRead } from './owned-data-telemetry';

describe('measureOwnedDataRead', () => {
  beforeEach(() => emitCostMetricMock.mockReset());

  it('returns the original value and records request/result volume', async () => {
    const value = ['a', 'b'];
    await expect(
      measureOwnedDataRead({
        endpoint: '/api/industry/owned-assets',
        requested: 5,
        read: () => Promise.resolve(value),
        returned: (rows) => rows.length,
      }),
    ).resolves.toBe(value);
    expect(emitCostMetricMock).toHaveBeenCalledWith(
      'owned_data_read',
      expect.objectContaining({
        endpoint: '/api/industry/owned-assets',
        requested: 5,
        returned: 2,
        outcome: 'succeeded',
      }),
    );
  });

  it('records a failed read and rethrows the original error', async () => {
    const error = new Error('read failed');
    await expect(
      measureOwnedDataRead({
        endpoint: '/api/account/skills',
        read: () => Promise.reject(error),
        returned: () => 0,
      }),
    ).rejects.toBe(error);
    expect(emitCostMetricMock).toHaveBeenCalledWith(
      'owned_data_read',
      expect.objectContaining({ endpoint: '/api/account/skills', outcome: 'failed' }),
    );
  });
});
