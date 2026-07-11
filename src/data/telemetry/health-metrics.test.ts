import { describe, expect, it } from 'vitest';
import {
  budgetSummary,
  degradationCallerSummary,
  deriveCronStatus,
  deriveEsiSourceStatus,
  deriveGscStatus,
  fallbackRatePoints,
  fallbackSummary,
  formatAgo,
  formatPct,
  loginFrequencyBuckets,
  PRICES_HEALTHY_OUTCOMES,
  ratio,
  refreshVolumeSummary,
  SDE_HEALTHY_OUTCOMES,
  SDE_NEUTRAL_OUTCOMES,
} from './health-metrics';
import type { CronOutcomeCount } from './types';

describe('ratio + formatPct', () => {
  it('returns null for a zero denominator', () => {
    expect(ratio(5, 0)).toBeNull();
    expect(formatPct(null)).toBe('—');
  });

  it('renders a real 0% distinctly from an empty window', () => {
    expect(formatPct(ratio(0, 10))).toBe('0%');
    expect(formatPct(ratio(10, 10))).toBe('100%');
  });
});

describe('fallbackSummary edges', () => {
  it('empty window', () => {
    expect(fallbackSummary({ esi: 0, fallback: 0, perDay: [] })).toBe(
      'No price refreshes recorded this period.',
    );
  });

  it('real 0% (all ESI)', () => {
    expect(fallbackSummary({ esi: 100, fallback: 0, perDay: [] })).toBe(
      'ESI served every priced item this period.',
    );
  });

  it('partial fallback', () => {
    expect(fallbackSummary({ esi: 75, fallback: 25, perDay: [] })).toBe(
      'Fuzzwork covered 25% of priced items when ESI was unavailable.',
    );
  });
});

describe('budgetSummary', () => {
  it('zero', () => {
    expect(budgetSummary(0)).toBe('ESI stayed within its error budget all period.');
  });
  it('singular vs plural', () => {
    expect(budgetSummary(1)).toBe(
      'ESI hit its error-budget floor 1 time, falling back to Fuzzwork.',
    );
    expect(budgetSummary(3)).toContain('3 times');
  });
});

describe('degradationCallerSummary', () => {
  it('empty', () => {
    expect(degradationCallerSummary([])).toBe('No price-source degradation events this period.');
  });
  it('lists callers', () => {
    expect(
      degradationCallerSummary([
        { caller: 'cron', count: 2 },
        { caller: 'on-demand', count: 1 },
      ]),
    ).toBe('3 degradation events this period (2 cron, 1 on-demand).');
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
      headline: 'never ran',
    });
  });

  it('green when fresh and the latest outcome is healthy', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(2), outcome: 'refreshed' },
    });
    expect(s).toEqual({ level: 'green', headline: 'healthy · last run 2h ago' });
  });

  it('red when the latest outcome is unhealthy, even if fresh', () => {
    const s = deriveCronStatus({
      ...daily,
      healthy: SDE_HEALTHY_OUTCOMES,
      neutral: SDE_NEUTRAL_OUTCOMES,
      lastRun: { timestamp: hoursAgo(5), outcome: 'remote-unreachable' },
    });
    expect(s).toEqual({ level: 'red', headline: 'failing · remote-unreachable 5h ago' });
  });

  it('red when the run never recorded an outcome', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(1), outcome: null },
    });
    expect(s.level).toBe('red');
    expect(s.headline).toContain('unknown outcome');
  });

  it('amber when late (between 1.25× and 2× the interval)', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(36), outcome: 'refreshed' },
    });
    expect(s).toEqual({ level: 'amber', headline: 'late · last run 1d ago' });
  });

  it('red when stale (past 2× the interval)', () => {
    const s = deriveCronStatus({
      ...daily,
      lastRun: { timestamp: hoursAgo(72), outcome: 'refreshed' },
    });
    expect(s).toEqual({ level: 'red', headline: 'stale · last run 3d ago' });
  });

  it('daily interval keeps a fresh SDE run green', () => {
    const s = deriveCronStatus({
      ...daily,
      healthy: SDE_HEALTHY_OUTCOMES,
      neutral: SDE_NEUTRAL_OUTCOMES,
      lastRun: { timestamp: hoursAgo(20), outcome: 'up-to-date' },
    });
    expect(s).toEqual({ level: 'green', headline: 'healthy · last run 20h ago' });
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
      headline: 'recovered · 2 failed runs this period, latest healthy 1d ago',
    });
  });
});

describe('deriveGscStatus', () => {
  const now = new Date('2026-06-09T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const base = { configured: true, outcomes: [], lastSyncedAt: null, now };

  it('neutral when not configured', () => {
    const s = deriveGscStatus({ ...base, configured: false, lastRun: null });
    expect(s.level).toBe('neutral');
    expect(s.headline).toContain('not connected');
  });

  it('green with a data-through date when synced', () => {
    const s = deriveGscStatus({
      ...base,
      lastRun: { timestamp: hoursAgo(3), outcome: 'synced' },
      lastSyncedAt: new Date('2026-06-09T09:00:00Z'),
    });
    expect(s).toEqual({
      level: 'green',
      headline: 'healthy · last run 3h ago · data through 2026-06-09',
    });
  });

  it('amber when the latest sync was partial', () => {
    const s = deriveGscStatus({
      ...base,
      lastRun: { timestamp: hoursAgo(3), outcome: 'partial' },
    });
    expect(s).toEqual({ level: 'amber', headline: 'degraded · partial 3h ago' });
  });

  it('red when the latest sync failed', () => {
    const s = deriveGscStatus({
      ...base,
      lastRun: { timestamp: hoursAgo(3), outcome: 'failed' },
    });
    expect(s).toEqual({ level: 'red', headline: 'failing · failed 3h ago' });
  });
});

describe('deriveEsiSourceStatus', () => {
  it('neutral on an empty window', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 0, fallback: 0, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toEqual({ level: 'neutral', headline: 'no price refreshes this period' });
  });

  it('green when ESI served everything', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 500, fallback: 0, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toEqual({ level: 'green', headline: 'ESI served every priced item this period' });
  });

  it('amber on a minority fallback share', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 75, fallback: 25, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toEqual({ level: 'amber', headline: 'partial · 25% fallback' });
  });

  it('amber on budget exhaustion even with zero fallback rows', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 100, fallback: 0, perDay: [] },
      budgetExhaustions: 2,
    });
    expect(s).toEqual({ level: 'amber', headline: 'partial · 2 budget exhaustions' });
  });

  it('a tiny non-zero rate reads as <1%, not 0%', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 10_000, fallback: 3, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s.headline).toBe('partial · <1% fallback');
  });

  it('red when fallback covers the majority', () => {
    const s = deriveEsiSourceStatus({
      fallback: { esi: 20, fallback: 80, perDay: [] },
      budgetExhaustions: 0,
    });
    expect(s).toEqual({
      level: 'red',
      headline: 'degraded · Fuzzwork covered 80% of priced items',
    });
  });
});

describe('fallbackRatePoints', () => {
  it('computes the whole-percent fallback share per day', () => {
    expect(
      fallbackRatePoints([
        { esi: 90, fallback: 10 }, // 10%
        { esi: 3, fallback: 1 }, // 25%
      ]),
    ).toEqual([10, 25]);
  });

  it('reads 0 for a day with no refreshes (no divide-by-zero)', () => {
    expect(fallbackRatePoints([{ esi: 0, fallback: 0 }])).toEqual([0]);
  });

  it('rounds to the nearest whole percent', () => {
    expect(fallbackRatePoints([{ esi: 2, fallback: 1 }])).toEqual([33]); // 33.33 → 33
  });
});
