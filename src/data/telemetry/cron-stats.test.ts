import { expect, test } from 'vitest';
import { fallbackRate, refreshVolume, splitCronOutcomes } from './cron-stats';

test('splitCronOutcomes gives every tracked cron its own list, in the order the rows arrived', () => {
  expect(
    splitCronOutcomes([
      { action: 'cron_prices', outcome: 'refreshed', count: 5, avgDurationMs: 1200.4 },
      { action: 'cron_prices', outcome: 'skipped', count: 2, avgDurationMs: 10.5 },
      { action: 'cron_gsc', outcome: 'synced', count: '1' as unknown as number, avgDurationMs: '800' as unknown as number },
      { action: 'cron_wh_statics', outcome: 'checked', count: 9, avgDurationMs: 1 },
    ]),
  ).toEqual({
    cron_prices: [
      { outcome: 'refreshed', count: 5, avgDurationMs: 1200 },
      { outcome: 'skipped', count: 2, avgDurationMs: 11 },
    ],
    cron_sde: [],
    cron_gsc: [{ outcome: 'synced', count: 1, avgDurationMs: 800 }],
    cron_housekeeping: [],
  });
});

test('fallbackRate totals the refresh days and keeps each day, and refreshVolume keeps the fetched and written volume per day', () => {
  const days = [
    { day: '2026-07-01', esi: 90, fallback: 10, fetched: 300, written: 280 },
    { day: '2026-07-03', esi: 50, fallback: 0, fetched: 120, written: 120 },
  ];
  expect(fallbackRate(days)).toEqual({
    esi: 140,
    fallback: 10,
    perDay: [
      { day: '2026-07-01', esi: 90, fallback: 10 },
      { day: '2026-07-03', esi: 50, fallback: 0 },
    ],
  });
  expect(refreshVolume(days)).toEqual([
    { day: '2026-07-01', fetched: 300, written: 280 },
    { day: '2026-07-03', fetched: 120, written: 120 },
  ]);
});
