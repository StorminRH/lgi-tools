import { describe, expect, it } from 'vitest';
import {
  getLatestUrlCoverage,
  mergeCurrentUrlCoverage,
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
  it('returns no latest state without querying Postgres', async () => {
    await expect(getLatestUrlCoverage([])).resolves.toEqual([]);
  });
});

describe('mergeCurrentUrlCoverage', () => {
  it('keeps current URLs without a stored inspection visible as unknown', () => {
    const stored = {
      inspectionDate: '2026-07-13',
      url: 'https://lgi.tools/',
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      lastCrawlTime: null,
    };

    expect(
      mergeCurrentUrlCoverage(
        ['https://lgi.tools/', 'https://lgi.tools/new'],
        [stored],
      ),
    ).toEqual([
      stored,
      {
        inspectionDate: null,
        url: 'https://lgi.tools/new',
        verdict: null,
        coverageState: null,
        lastCrawlTime: null,
      },
    ]);
  });
});
