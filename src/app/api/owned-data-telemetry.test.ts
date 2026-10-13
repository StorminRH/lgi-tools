import { expect, it, vi } from 'vitest';

const { logUsageEvent } = vi.hoisted(() => ({
  logUsageEvent: vi.fn(async (_event: unknown) => {}),
}));

vi.mock('next/server', () => ({ after: (work: () => unknown) => work() }));
vi.mock('@/data/telemetry/log', () => ({ logUsageEvent }));

import { measureOwnedDataRead } from './owned-data-telemetry';

it('resolves the read value and records its volume on the monotonic clock', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(112.5);
  const value = ['a', 'b'];

  await expect(
    measureOwnedDataRead({
      endpoint: { path: '/api/industry/owned-assets' },
      requested: 5,
      read: () => Promise.resolve(value),
      returned: (rows) => rows.length,
    }),
  ).resolves.toBe(value);

  expect(logUsageEvent).toHaveBeenLastCalledWith({
    action: 'owned_data_read',
    metadata: {
      endpoint: '/api/industry/owned-assets',
      requested: 5,
      returned: 2,
      outcome: 'succeeded',
      durationMs: 12.5,
    },
  });
  clock.mockRestore();
});

it('records a failed read without a result volume and rethrows the original error', async () => {
  const error = new Error('read failed');

  await expect(
    measureOwnedDataRead({
      endpoint: { path: '/api/account/industry-slots' },
      read: () => Promise.reject(error),
      returned: () => 0,
    }),
  ).rejects.toBe(error);

  expect(logUsageEvent).toHaveBeenLastCalledWith({
    action: 'owned_data_read',
    metadata: {
      endpoint: '/api/account/industry-slots',
      outcome: 'failed',
      durationMs: expect.any(Number),
    },
  });
});
