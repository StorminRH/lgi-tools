import { describe, expect, it } from 'vitest';
import {
  deriveCronStatus,
  deriveEsiSourceStatus,
  deriveGscStatus,
  ESI_AVAILABILITY_TARGET,
  fallbackRatePoints,
  formatAgo,
  loginFrequencyBuckets,
  PRICES_HEALTHY_OUTCOMES,
  refreshVolumeSummary,
  SDE_HEALTHY_OUTCOMES,
  SDE_NEUTRAL_OUTCOMES,
  targetLevel,
} from './health-metrics';
import type { CronOutcomeCount } from './types';

describe('targetLevel', () => {
  it('turns amber past the warn line and red past the fail line, in either direction', () => {
    expect(targetLevel(0.99, ESI_AVAILABILITY_TARGET)).toBe('green');
    expect(targetLevel(0.9, ESI_AVAILABILITY_TARGET)).toBe('amber');
    expect(targetLevel(0.5, ESI_AVAILABILITY_TARGET)).toBe('red');
    const latency = { warn: 1500, fail: 3000, direction: 'max' } as const;
    expect(targetLevel(1000, latency)).toBe('green');
    expect(targetLevel(2000, latency)).toBe('amber');
    expect(targetLevel(4000, latency)).toBe('red');
  });
});

describe('refreshVolumeSummary', () => {
  it('empty', () => {
    expect(refreshVolumeSummary([])).toBe('No price refreshes recorded this period.');
  });
  it('totals across days', () => {
    expect(
      refreshVolumeSummary([
        { day: '2026-06-01', fetched: 1000, written: 900 },
        { day: '2026-06-02', fetched: 500, written: 500 },
      ]),
    ).toBe('Refreshed on 2 days, writing 1,400 of 1,500 fetched rows.');
  });
});

describe('loginFrequencyBuckets', () => {
  it('buckets by login count', () => {
    const buckets = loginFrequencyBuckets([1, 1, 2, 3, 5, 9, 10, 25]);
    expect(buckets).toEqual([
      { label: '1', users: 2 },
      { label: '2–3', users: 2 },
      { label: '4–9', users: 2 },
      { label: '10+', users: 2 },
    ]);
  });

  it('empty input gives all-zero buckets', () => {
    expect(loginFrequencyBuckets([]).every((b) => b.users === 0)).toBe(true);
  });
});

describe('formatAgo', () => {
  const now = new Date('2026-06-09T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('boundaries between units', () => {
    expect(formatAgo(ago(30_000), now)).toBe('just now');
    expect(formatAgo(ago(60_000), now)).toBe('1m ago');
    expect(formatAgo(ago(59 * 60_000), now)).toBe('59m ago');
    expect(formatAgo(ago(60 * 60_000), now)).toBe('1h ago');
    expect(formatAgo(ago(23 * 3_600_000), now)).toBe('23h ago');
    expect(formatAgo(ago(24 * 3_600_000), now)).toBe('1d ago');
    expect(formatAgo(ago(15 * 24 * 3_600_000), now)).toBe('15d ago');
  });
});

describe('deriveCronStatus', () => {
  const now = new Date('2026-06-09T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const daily = {
    outcomes: [] as CronOutcomeCount[],
    healthy: PRICES_HEALTHY_OUTCOMES,
    expectedEveryHours: 24,
    now,
  };

  it('red when the cron never ran', () => {
    expect(deriveCronStatus({ ...daily, lastRun: null })).toEqual({
      level: 'red',
      value: 'never ran',
    });
  });

  it('green when fresh and the latest outcome is healthy', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(2), outcome: 'refreshed' },
    });
    expect(s).toEqual({ level: 'green', value: 'healthy', note: 'last run 2h ago' });
  });

  it('red when the latest outcome is unhealthy, even if fresh', () => {
    const s = deriveCronStatus({
      ...daily,
      healthy: SDE_HEALTHY_OUTCOMES,
      neutral: SDE_NEUTRAL_OUTCOMES,
      lastRun: { timestamp: hoursAgo(5), outcome: 'remote-unreachable' },
    });
    expect(s).toEqual({ level: 'red', value: 'failing', note: 'remote-unreachable 5h ago' });
  });

  it('red when the run never recorded an outcome', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(1), outcome: null },
    });
    expect(s.level).toBe('red');
    expect(s).toMatchObject({ value: 'failing', note: 'unknown outcome 1h ago' });
  });

  it('amber when late (between 1.25× and 2× the interval)', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(36), outcome: 'refreshed' },
    });
    expect(s).toEqual({ level: 'amber', value: 'late', note: 'last run 1d ago' });
  });

  it('red when stale (past 2× the interval)', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(72), outcome: 'refreshed' },
    });
    expect(s).toEqual({ level: 'red', value: 'stale', note: 'last run 3d ago' });
  });

  it('daily interval keeps a fresh SDE run green', () => {
    const s = deriveCronStatus({
      ...daily,
      healthy: SDE_HEALTHY_OUTCOMES,
      neutral: SDE_NEUTRAL_OUTCOMES,
      lastRun: { timestamp: hoursAgo(20), outcome: 'up-to-date' },
    });
    expect(s).toEqual({ level: 'green', value: 'healthy', note: 'last run 20h ago' });
  });

  it('neutral latest outcome (lock-skip) does not read as failing', () => {
    const s = deriveCronStatus({
      ...daily,
      healthy: SDE_HEALTHY_OUTCOMES,
      neutral: SDE_NEUTRAL_OUTCOMES,
      lastRun: { timestamp: hoursAgo(24), outcome: 'busy' },
    });
    expect(s.level).toBe('green');
  });

  it('amber when the latest run is healthy but the period saw failures', () => {
    const s = deriveCronStatus({
      ...daily,
      healthy: SDE_HEALTHY_OUTCOMES,
      neutral: SDE_NEUTRAL_OUTCOMES,
      lastRun: { timestamp: hoursAgo(24), outcome: 'up-to-date' },
      outcomes: [
        { outcome: 'up-to-date', count: 3, avgDurationMs: 20 },
        { outcome: 'remote-unreachable', count: 2, avgDurationMs: 30 },
      ],
    });
    expect(s).toEqual({
      level: 'amber',
      value: 'recovered',
      note: '2 failed runs this period, latest healthy 1d ago',
      quiet: true,
    });
  });

  it('counts a single recovered failure in the singular', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(2), outcome: 'refreshed' },
      outcomes: [{ outcome: 'failed', count: 1, avgDurationMs: 30 }],
    });
    expect(s.note).toBe('1 failed run this period, latest healthy 2h ago');
  });
});

describe('deriveGscStatus', () => {
  const now = new Date('2026-06-09T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const base = { configured: true, outcomes: [], lastSyncedAt: null, now };

  it('neutral when not configured', () => {
    const s = deriveGscStatus({ ...base, configured: false, lastRun: null });
    expect(s).toEqual({ level: 'neutral', value: 'not connected' });
  });

  it('green with a data-through date when synced', () => {
    const s = deriveGscStatus({
      ...base,
      lastRun: { timestamp: hoursAgo(3), outcome: 'synced' },
      lastSyncedAt: new Date('2026-06-09T09:00:00Z'),
    });
    expect(s).toEqual({
      level: 'green',
      value: 'healthy',
      note: 'last run 3h ago · last synced 2026-06-09',
    });
  });

  it('amber when the latest sync was partial', () => {
    const s = deriveGscStatus({
      ...base,
      lastRun: { timestamp: hoursAgo(3), outcome: 'partial' },
    });
    expect(s).toEqual({ level: 'amber', value: 'degraded', note: 'partial 3h ago' });
  });

  it('red when the latest sync failed', () => {
    const s = deriveGscStatus({
      ...base,
      lastRun: { timestamp: hoursAgo(3), outcome: 'failed' },
    });
    expect(s).toEqual({ level: 'red', value: 'failing', note: 'failed 3h ago' });
  });
});

describe('deriveEsiSourceStatus', () => {
  it('neutral on an empty window', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 0, fallback: 0, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toEqual({ level: 'neutral', value: 'idle', note: 'no price refreshes this period' });
  });

  it('green when ESI served everything', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 500, fallback: 0, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toEqual({ level: 'green', value: 'healthy', note: 'ESI served every priced item this period' });
  });

  it('amber on a minority fallback share', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 75, fallback: 25, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toEqual({ level: 'amber', value: 'partial', note: '25% fallback' });
  });

  it('amber on budget exhaustion even with zero fallback rows', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 100, fallback: 0, perDay: [] },
      budgetExhaustions: 2,
    });
    expect(s).toEqual({ level: 'amber', value: 'partial', note: '2 budget exhaustions' });
  });

  it('a tiny non-zero rate reads as <1%, not 0%', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 10_000, fallback: 3, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toMatchObject({ value: 'partial', note: '<1% fallback' });
  });

  it('red when fallback covers the majority', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 20, fallback: 80, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toEqual({
      level: 'red',
      value: 'degraded',
      note: 'Fuzzwork covered 80% of priced items',
    });
  });
});

describe('fallbackRatePoints', () => {
  it('computes the whole-percent fallback share per day', () => {
    expect(
      fallbackRatePoints([
        { esi: 90, fallback: 10 },
        { esi: 3, fallback: 1 },
      ]),
    ).toEqual([10, 25]);
  });

  it('reads 0 for a day with no refreshes (no divide-by-zero)', () => {
    expect(fallbackRatePoints([{ esi: 0, fallback: 0 }])).toEqual([0]);
  });

  it('rounds to the nearest whole percent', () => {
    expect(fallbackRatePoints([{ esi: 2, fallback: 1 }])).toEqual([33]);
  });
});
