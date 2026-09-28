import { describe, expect, it } from 'vitest';
import { deriveGscMultiples } from './gsc-multiples-view';

describe('deriveGscMultiples', () => {
  it('builds clicks/impressions/position cells with deltas; position inverts', () => {
    const cells = deriveGscMultiples({
      totals: { clicks: 120, impressions: 4000, ctr: 0.03, position: 8.4 },
      prevTotals: { clicks: 100, impressions: 5000, position: 10.5 },
    });
    expect(cells.map((c) => c.title)).toEqual(['Clicks', 'Impressions', 'Avg position']);
    expect(cells[0]).toMatchObject({ value: '120', invert: false, note: '3.0% CTR', delta: { pct: 20, direction: 'up' } });
    expect(cells[1]).toMatchObject({ value: '4,000', delta: { pct: -20, direction: 'down' } });
    expect(cells[2]).toMatchObject({
      value: '8.4',
      invert: true,
      delta: { pct: -20, direction: 'down' },
    });
  });

  it('has null deltas when there is no prior window', () => {
    const cells = deriveGscMultiples({
      totals: { clicks: 10, impressions: 200, ctr: 0.05, position: 5 },
      prevTotals: null,
    });
    expect(cells.every((c) => c.delta === null)).toBe(true);
  });
});

describe('missing position observations', () => {
  it('does not treat no impressions as a perfect rank or a rank improvement', () => {
    const previous = { clicks: 1, impressions: 10, position: 7 };
    const cells = deriveGscMultiples({ totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, prevTotals: previous });
    expect(cells[2]).toMatchObject({ value: '—', delta: null });
    const observed = deriveGscMultiples({ totals: { ...previous, ctr: 0.1 }, prevTotals: { clicks: 0, impressions: 0, position: 0 } });
    expect(observed[2]?.delta).toBeNull();
  });
});
