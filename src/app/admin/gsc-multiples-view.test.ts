import { describe, expect, it } from 'vitest';
import { deriveGscMultiples } from './gsc-multiples-view';

describe('deriveGscMultiples', () => {
  it('builds clicks/impressions/position cells with deltas; position inverts', () => {
    const cells = deriveGscMultiples({
      totals: { clicks: 120, impressions: 4000, position: 8.4 },
      prevTotals: { clicks: 100, impressions: 5000, position: 10.5 },
    });
    expect(cells.map((c) => c.title)).toEqual(['Clicks', 'Impressions', 'Avg position']);
    expect(cells[0]).toMatchObject({ value: '120', invert: false, delta: { pct: 20, direction: 'up' } });
    expect(cells[1]).toMatchObject({ value: '4,000', delta: { pct: -20, direction: 'down' } });
    // Position fell 10.5 → 8.4 (an improvement); the cell inverts and is labelled.
    expect(cells[2]).toMatchObject({
      value: '8.4',
      invert: true,
      note: 'lower = better',
      delta: { pct: -20, direction: 'down' },
    });
  });

  it('has null deltas when there is no prior window', () => {
    const cells = deriveGscMultiples({
      totals: { clicks: 10, impressions: 200, position: 5 },
      prevTotals: null,
    });
    expect(cells.every((c) => c.delta === null)).toBe(true);
  });
});
