import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, state, reset } = await vi.hoisted(async () => {
  const { createFakeQueryChain } = await import('@/db/__tests__/support/fake-query-chain');
  return createFakeQueryChain();
});

vi.mock('@/db', () => ({ db: chain }));

import { getCronOutcomes, getPriceRefreshDays } from './queries';

const RANGE = {
  from: new Date('2026-07-01T00:00:00Z'),
  to: new Date('2026-07-08T00:00:00Z'),
};

beforeEach(() => {
  reset();
});

describe('telemetry query result shaping', () => {
  it('normalizes price refresh days to numbers', async () => {
    state.results = [[{ day: '2026-07-02', esi: '20', fallback: '2', fetched: '300', written: '280' }]];

    await expect(getPriceRefreshDays(RANGE)).resolves.toEqual([
      { day: '2026-07-02', esi: 20, fallback: 2, fetched: 300, written: 280 },
    ]);
  });

  it('splits cron outcomes by action with numeric counts and rounded durations', async () => {
    state.results = [
      [
        { action: 'cron_prices', outcome: 'refreshed', count: '3', avgDurationMs: '1500.6' },
        { action: 'cron_sde', outcome: 'up-to-date', count: '1', avgDurationMs: '0' },
      ],
    ];

    await expect(getCronOutcomes(RANGE)).resolves.toEqual({
      cron_prices: [{ outcome: 'refreshed', count: 3, avgDurationMs: 1501 }],
      cron_sde: [{ outcome: 'up-to-date', count: 1, avgDurationMs: 0 }],
      cron_gsc: [],
      cron_housekeeping: [],
    });
  });
});
