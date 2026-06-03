import { describe, expect, it } from 'vitest';
import {
  budgetSummary,
  cronHealthSummary,
  degradationCallerSummary,
  fallbackSummary,
  formatPct,
  loginFrequencyBuckets,
  ratio,
  refreshVolumeSummary,
  returningVsNewSummary,
  searchVsDirectSummary,
  summarizeCronHealth,
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

describe('summarizeCronHealth', () => {
  const prices = (refreshed: number, skipped: number): CronOutcomeCount[] => [
    { outcome: 'refreshed', count: refreshed, avgDurationMs: 1000 },
    { outcome: 'skipped', count: skipped, avgDurationMs: 50 },
  ];

  it('treats refreshed + skipped as healthy and busy as neutral', () => {
    const h = summarizeCronHealth(prices(3, 2), [
      { outcome: 'up-to-date', count: 1, avgDurationMs: 20 },
      { outcome: 'busy', count: 4, avgDurationMs: 10 },
    ]);
    expect(h.healthy).toBe(6);
    expect(h.neutral).toBe(4);
    expect(h.unhealthy).toBe(0);
    expect(h.total).toBe(6);
    expect(h.ratio).toBe(1);
  });

  it('counts remote-unreachable against health', () => {
    const h = summarizeCronHealth([], [
      { outcome: 'up-to-date', count: 3, avgDurationMs: 20 },
      { outcome: 'remote-unreachable', count: 1, avgDurationMs: 30 },
    ]);
    expect(h.total).toBe(4);
    expect(h.ratio).toBe(0.75);
  });

  it('ratio is null when only neutral runs exist', () => {
    const h = summarizeCronHealth([], [{ outcome: 'busy', count: 2, avgDurationMs: 10 }]);
    expect(h.total).toBe(0);
    expect(h.neutral).toBe(2);
    expect(h.ratio).toBeNull();
  });

  it('ratio is null on an empty window', () => {
    expect(summarizeCronHealth([], []).ratio).toBeNull();
  });
});

describe('cronHealthSummary edges', () => {
  it('empty window', () => {
    expect(cronHealthSummary(summarizeCronHealth([], []))).toBe(
      'No cron runs recorded this period.',
    );
  });

  it('only neutral (lock-held) runs', () => {
    const h = summarizeCronHealth([], [{ outcome: 'busy', count: 1, avgDurationMs: 5 }]);
    expect(cronHealthSummary(h)).toBe(
      '1 run skipped while another ingest held the lock; none failed.',
    );
  });

  it('all healthy', () => {
    const h = summarizeCronHealth(
      [{ outcome: 'refreshed', count: 5, avgDurationMs: 100 }],
      [],
    );
    expect(cronHealthSummary(h)).toBe('Every recorded cron run completed healthy.');
  });

  it('some unhealthy', () => {
    const h = summarizeCronHealth(
      [{ outcome: 'refreshed', count: 3, avgDurationMs: 100 }],
      [{ outcome: 'remote-unreachable', count: 1, avgDurationMs: 30 }],
    );
    expect(cronHealthSummary(h)).toBe('3 of 4 cron runs completed healthy; 1 needs attention.');
  });

  it('pluralizes when more than one is unhealthy', () => {
    const h = summarizeCronHealth(
      [{ outcome: 'refreshed', count: 3, avgDurationMs: 100 }],
      [{ outcome: 'remote-unreachable', count: 2, avgDurationMs: 30 }],
    );
    expect(cronHealthSummary(h)).toBe('3 of 5 cron runs completed healthy; 2 need attention.');
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

describe('returningVsNewSummary edges', () => {
  it('empty', () => {
    expect(returningVsNewSummary({ newUsers: 0, returning: 0 })).toBe(
      'No sign-ins recorded this period.',
    );
  });
  it('all new (e.g. range=all)', () => {
    expect(returningVsNewSummary({ newUsers: 4, returning: 0 })).toBe(
      '4 new sign-ins; no returning users this period.',
    );
  });
  it('all returning', () => {
    expect(returningVsNewSummary({ newUsers: 0, returning: 2 })).toBe(
      '2 returning users; no new sign-ins this period.',
    );
  });
  it('mixed', () => {
    expect(returningVsNewSummary({ newUsers: 1, returning: 3 })).toBe(
      '3 returning and 1 new this period.',
    );
  });
});

describe('searchVsDirectSummary edges', () => {
  it('empty', () => {
    expect(searchVsDirectSummary({ referred: 0, direct: 0 })).toBe(
      'No page views recorded this period.',
    );
  });
  it('all direct', () => {
    expect(searchVsDirectSummary({ referred: 0, direct: 50 })).toBe(
      'All page views were direct or same-site this period.',
    );
  });
  it('partial referred', () => {
    expect(searchVsDirectSummary({ referred: 30, direct: 70 })).toBe(
      '30% of page views arrived with an external referrer.',
    );
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
