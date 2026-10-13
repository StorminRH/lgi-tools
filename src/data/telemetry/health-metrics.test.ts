import { expect, test } from 'vitest';
import {
  deriveCronStatus,
  deriveEsiSourceStatus,
  deriveGscStatus,
  ESI_AVAILABILITY_TARGET,
  fallbackRatePoints,
  formatClientErrorShare,
  formatFallbackShare,
  loginFrequencyBuckets,
  PRICES_HEALTHY_OUTCOMES,
  refreshVolumeSummary,
  SDE_HEALTHY_OUTCOMES,
  SDE_NEUTRAL_OUTCOMES,
  targetLevel,
} from './health-metrics';
import type { CronOutcomeCount } from './types';

const NOW = new Date('2026-06-09T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

test('targetLevel turns amber past the warn line and red past the fail line, in either direction', () => {
  expect(targetLevel(0.99, ESI_AVAILABILITY_TARGET)).toBe('green');
  expect(targetLevel(0.9, ESI_AVAILABILITY_TARGET)).toBe('amber');
  expect(targetLevel(0.5, ESI_AVAILABILITY_TARGET)).toBe('red');
  const latency = { warn: 1500, fail: 3000, direction: 'max' } as const;
  expect(targetLevel(1000, latency)).toBe('green');
  expect(targetLevel(2000, latency)).toBe('amber');
  expect(targetLevel(4000, latency)).toBe('red');
});

test('formatClientErrorShare never rounds a real share down to zero and drops the decimal from ten percent up', () => {
  expect(formatClientErrorShare(0)).toBe('0.0%');
  expect(formatClientErrorShare(1 / 2_500)).toBe('<0.1%');
  expect(formatClientErrorShare(0.035)).toBe('3.5%');
  expect(formatClientErrorShare(0.15)).toBe('15%');
});

test('refreshVolumeSummary totals the period, counting a single day in the singular', () => {
  expect(refreshVolumeSummary([{ day: '2026-06-01', fetched: 1_000, written: 900 }])).toBe(
    'Refreshed on 1 day, writing 900 of 1,000 fetched rows.',
  );
  expect(
    refreshVolumeSummary([
      { day: '2026-06-01', fetched: 1000, written: 900 },
      { day: '2026-06-02', fetched: 500, written: 500 },
    ]),
  ).toBe('Refreshed on 2 days, writing 1,400 of 1,500 fetched rows.');
});

test('loginFrequencyBuckets buckets by login count, with every bucket at zero for no users', () => {
  expect(loginFrequencyBuckets([1, 1, 2, 3, 5, 9, 10, 25])).toEqual([
    { label: '1', users: 2 },
    { label: '2–3', users: 2 },
    { label: '4–9', users: 2 },
    { label: '10+', users: 2 },
  ]);
  expect(loginFrequencyBuckets([])).toEqual([
    { label: '1', users: 0 },
    { label: '2–3', users: 0 },
    { label: '4–9', users: 0 },
    { label: '10+', users: 0 },
  ]);
});

test('deriveCronStatus reads a daily cron as never ran, healthy, failing, late, stale, neutral or recovered', () => {
  const daily = {
    outcomes: [] as CronOutcomeCount[],
    healthy: PRICES_HEALTHY_OUTCOMES,
    expectedEveryHours: 24,
    now: NOW,
  };
  const sde = { ...daily, healthy: SDE_HEALTHY_OUTCOMES, neutral: SDE_NEUTRAL_OUTCOMES };

  expect(deriveCronStatus({ ...daily, lastRun: null })).toEqual({ level: 'red', value: 'never ran' });

  expect(deriveCronStatus({ ...daily, lastRun: { timestamp: hoursAgo(2), outcome: 'refreshed' } })).toEqual({
    level: 'green',
    value: 'healthy',
    note: 'last run 2h ago',
  });

  // An unhealthy latest outcome is red even when fresh; a run with no outcome recorded reads the same.
  expect(deriveCronStatus({ ...sde, lastRun: { timestamp: hoursAgo(5), outcome: 'remote-unreachable' } })).toEqual({
    level: 'red',
    value: 'failing',
    note: 'remote-unreachable 5h ago',
  });
  expect(deriveCronStatus({ ...daily, lastRun: { timestamp: hoursAgo(1), outcome: null } })).toEqual({
    level: 'red',
    value: 'failing',
    note: 'unknown outcome 1h ago',
  });

  // Late between 1.25× and 2× the interval, stale past 2×.
  expect(deriveCronStatus({ ...daily, lastRun: { timestamp: hoursAgo(36), outcome: 'refreshed' } })).toEqual({
    level: 'amber',
    value: 'late',
    note: 'last run 1d ago',
  });
  expect(deriveCronStatus({ ...daily, lastRun: { timestamp: hoursAgo(72), outcome: 'refreshed' } })).toEqual({
    level: 'red',
    value: 'stale',
    note: 'last run 3d ago',
  });

  // A neutral latest outcome (a lock skip) does not read as failing.
  expect(deriveCronStatus({ ...sde, lastRun: { timestamp: hoursAgo(24), outcome: 'busy' } }).level).toBe('green');

  // A healthy latest run after failures in the period is a quiet amber, counted in the singular for one.
  expect(
    deriveCronStatus({
      ...sde,
      lastRun: { timestamp: hoursAgo(24), outcome: 'up-to-date' },
      outcomes: [
        { outcome: 'up-to-date', count: 3, avgDurationMs: 20 },
        { outcome: 'remote-unreachable', count: 2, avgDurationMs: 30 },
      ],
    }),
  ).toEqual({
    level: 'amber',
    value: 'recovered',
    note: '2 failed runs this period, latest healthy 1d ago',
    quiet: true,
  });
  expect(
    deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(2), outcome: 'refreshed' },
      outcomes: [{ outcome: 'failed', count: 1, avgDurationMs: 30 }],
    }).note,
  ).toBe('1 failed run this period, latest healthy 2h ago');
});

test('deriveGscStatus is neutral until connected, then green with the data-through date, amber on a partial sync and red on a failed one', () => {
  const base = { configured: true, outcomes: [], lastSyncedAt: null, now: NOW };

  expect(deriveGscStatus({ ...base, configured: false, lastRun: null })).toEqual({
    level: 'neutral',
    value: 'not connected',
  });
  expect(
    deriveGscStatus({
      ...base,
      lastRun: { timestamp: hoursAgo(3), outcome: 'synced' },
      lastSyncedAt: new Date('2026-06-09T09:00:00Z'),
    }),
  ).toEqual({ level: 'green', value: 'healthy', note: 'last run 3h ago · last synced 2026-06-09' });
  expect(deriveGscStatus({ ...base, lastRun: { timestamp: hoursAgo(3), outcome: 'partial' } })).toEqual({
    level: 'amber',
    value: 'degraded',
    note: 'partial 3h ago',
  });
  expect(deriveGscStatus({ ...base, lastRun: { timestamp: hoursAgo(3), outcome: 'failed' } })).toEqual({
    level: 'red',
    value: 'failing',
    note: 'failed 3h ago',
  });
});

test('deriveEsiSourceStatus is idle with no refreshes, green when ESI served everything, amber on a minority fallback or a budget exhaustion, and red when fallback covers the majority', () => {
  const status = (esi: number, fallback: number, budgetExhaustions = 0) =>
    deriveEsiSourceStatus({ fallback: { esi, fallback, perDay: [] }, budgetExhaustions });

  expect(status(0, 0)).toEqual({ level: 'neutral', value: 'idle', note: 'no price refreshes this period' });
  expect(status(500, 0)).toEqual({ level: 'green', value: 'healthy', note: 'ESI served every priced item this period' });
  expect(status(75, 25)).toEqual({ level: 'amber', value: 'partial', note: '25% fallback' });
  expect(status(100, 0, 2)).toEqual({ level: 'amber', value: 'partial', note: '2 budget exhaustions' });
  // A tiny non-zero rate reads as <1%, not 0%.
  expect(status(10_000, 3)).toMatchObject({ value: 'partial', note: '<1% fallback' });
  expect(status(20, 80)).toEqual({ level: 'red', value: 'degraded', note: 'Fuzzwork covered 80% of priced items' });
});

test('formatFallbackShare never rounds a real fallback down to zero', () => {
  expect(formatFallbackShare({ esi: 999, fallback: 1 })).toBe('<1%');
  expect(formatFallbackShare({ esi: 100, fallback: 0 })).toBe('0%');
  expect(formatFallbackShare({ esi: 50, fallback: 50 })).toBe('50%');
  expect(formatFallbackShare({ esi: 0, fallback: 0 })).toBe('no data');
});

test('fallbackRatePoints gives the whole-percent fallback share per day, rounded, and 0 for a day with no refreshes', () => {
  expect(
    fallbackRatePoints([
      { esi: 90, fallback: 10 },
      { esi: 3, fallback: 1 },
      { esi: 2, fallback: 1 },
      { esi: 0, fallback: 0 },
    ]),
  ).toEqual([10, 25, 33, 0]);
});
