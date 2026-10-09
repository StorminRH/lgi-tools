import { describe, expect, it } from 'vitest';
import { SECTION_LOAD_FAILED } from './load-section';
import { buildMetricRows } from './metric-view';

const base = {
  rangeDays: 30,
  pageViews: { referred: 300, direct: 600 },
  users: { newUsers: 12, returning: 48 },
  prevPageViews: { referred: 250, direct: 500 },
  prevUsers: { newUsers: 10, returning: 40 },
  search: {
    current: { clicks: 90, impressions: 3000 },
    previous: { clicks: 60, impressions: 2400 },
    rangeDays: 30,
  },
};

describe('buildMetricRows', () => {
  it('emits the four headline rows with value, per-day avg, and delta', () => {
    const rows = buildMetricRows(base);
    expect(rows.map((r) => r.label)).toEqual([
      'Page views',
      'Active users',
      'Search clicks',
      'Search impressions',
    ]);
    expect(rows[0]).toMatchObject({ value: '900', note: '30 / day', delta: { pct: 20, direction: 'up' } });
    expect(rows[1]?.note).toBeUndefined();
    expect(rows[2]).toMatchObject({ value: '90', note: '3.0 / day', delta: { pct: 50, direction: 'up' } });
    expect(rows[3]).toMatchObject({ value: '3,000', note: '100 / day' });
  });

  it('averages search over Google’s report days, not the traffic range', () => {
    const rows = buildMetricRows({
      ...base,
      search: { ...base.search, current: { clicks: 1_400, impressions: 70_000 }, rangeDays: 7 },
    });
    expect(rows[2]).toMatchObject({ value: '1,400', note: '200 / day' });
    expect(rows[3]).toMatchObject({ value: '70,000', note: '10,000 / day' });
  });

  it('degrades the GSC rows to em-dash with no avg or delta when GSC is off', () => {
    const rows = buildMetricRows({ ...base, search: null });
    expect(rows[2]).toEqual({ label: 'Search clicks', value: '—', delta: null });
    expect(rows[3]).toEqual({ label: 'Search impressions', value: '—', delta: null });
  });

  it('says only the search figures are unavailable when that read fails', () => {
    const rows = buildMetricRows({ ...base, search: SECTION_LOAD_FAILED });
    expect(rows[0]).toMatchObject({ value: '900' });
    expect(rows[2]).toEqual({ label: 'Search clicks', value: '—', note: 'unavailable', delta: null });
    expect(rows[3]).toEqual({ label: 'Search impressions', value: '—', note: 'unavailable', delta: null });
  });

  it('has no delta when the prior window is absent (all-time range)', () => {
    const rows = buildMetricRows({
      ...base,
      prevPageViews: null,
      prevUsers: null,
      search: { ...base.search, previous: null },
    });
    expect(rows[0]?.delta).toBeNull();
    expect(rows[1]?.delta).toBeNull();
    expect(rows[2]?.delta).toBeNull();
  });

  it('skips the average for an empty range', () => {
    expect(buildMetricRows({ ...base, rangeDays: 0 })[0]?.note).toBeUndefined();
  });
});
