import { describe, expect, it } from 'vitest';
import { buildMetricRows } from './metric-view';

const base = {
  rangeDays: 30,
  pageViews: { referred: 300, direct: 600 },
  users: { newUsers: 12, returning: 48 },
  gscTotals: { clicks: 90, impressions: 3000 },
  prevPageViews: { referred: 250, direct: 500 },
  prevUsers: { newUsers: 10, returning: 40 },
  prevGscTotals: { clicks: 60, impressions: 2400 },
};

describe('buildMetricRows', () => {
  it('emits the four headline rows with value, per-day avg, and delta', () => {
    const rows = buildMetricRows(base);
    expect(rows.map((r) => r.label)).toEqual([
      'Page views',
      'Signed-in users',
      'Search clicks',
      'Search impressions',
    ]);
    // 900 views over 30 days = 30/day; delta vs prev 750 = +20%.
    expect(rows[0]).toMatchObject({ value: '900', avg: '30', delta: { pct: 20, direction: 'up' } });
    // 60 users over 30 days = 2/day → one decimal below 10.
    expect(rows[1]?.avg).toBe('2.0');
  });

  it('attaches the daily series only to the GSC rows', () => {
    const rows = buildMetricRows({ ...base, clicksSeries: [1, 2, 3], impressionsSeries: [4, 5] });
    expect(rows[0]?.series).toBeUndefined();
    expect(rows[1]?.series).toBeUndefined();
    expect(rows[2]?.series).toEqual([1, 2, 3]);
    expect(rows[3]?.series).toEqual([4, 5]);
  });

  it('degrades the GSC rows to em-dash with no avg or delta when GSC is off', () => {
    const rows = buildMetricRows({
      ...base,
      gscTotals: null,
      prevGscTotals: null,
    });
    expect(rows[2]).toMatchObject({ value: '—', avg: null, delta: null });
    expect(rows[3]).toMatchObject({ value: '—', avg: null, delta: null });
  });

  it('has no delta when the prior window is absent (all-time range)', () => {
    const rows = buildMetricRows({
      ...base,
      prevPageViews: null,
      prevUsers: null,
      prevGscTotals: null,
    });
    expect(rows[0]?.delta).toBeNull();
    expect(rows[1]?.delta).toBeNull();
    expect(rows[2]?.delta).toBeNull();
  });
});
