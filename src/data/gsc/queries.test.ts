import { describe, expect, it } from 'vitest';
import {
  getCoverageTrend,
  getLatestUrlCoverage,
  toDateStr,
  toSearchTotals,
} from './queries';

describe('toDateStr', () => {
  it('formats a date as a YYYY-MM-DD string', () => {
    expect(toDateStr(new Date('2026-06-04T12:34:56Z'))).toBe('2026-06-04');
  });

  it('uses UTC (not local time) at the day boundary so range bounds are stable', () => {
    expect(toDateStr(new Date('2026-06-04T23:59:59Z'))).toBe('2026-06-04');
    expect(toDateStr(new Date('2026-06-05T00:00:00Z'))).toBe('2026-06-05');
  });
});

describe('toSearchTotals', () => {
  it('derives the click-through rate from a populated aggregate row', () => {
    expect(toSearchTotals({ clicks: 25, impressions: 100, position: 4.5 })).toEqual({
      clicks: 25,
      impressions: 100,
      ctr: 0.25,
      position: 4.5,
    });
  });

  it('returns zero totals when the aggregate query has no row', () => {
    expect(toSearchTotals(undefined)).toEqual({
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    });
  });
});

describe('coverage queries without a current sitemap', () => {
  it('return no latest state or trends without querying Postgres', async () => {
    const range = {
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-06-30T00:00:00Z'),
    };

    await expect(getLatestUrlCoverage([])).resolves.toEqual([]);
    await expect(getCoverageTrend(range, [])).resolves.toEqual([]);
  });
});
