import { describe, expect, it } from 'vitest';
import { distributionBars } from './distribution-bars';

describe('distributionBars', () => {
  it('sorts high→low and computes share of total plus fill vs the max', () => {
    const bars = distributionBars([
      { key: 'a', label: '/a', count: 20 },
      { key: 'b', label: '/b', count: 60 },
      { key: 'c', label: '/c', count: 20 },
    ]);
    expect(bars.map((b) => b.key)).toEqual(['b', 'a', 'c']);
    // total 100 → shares 60/20/20; max 60 → fills 100/33.3/33.3.
    expect(bars[0]).toMatchObject({ sharePct: 60, fillPct: 100 });
    expect(bars[1]!.sharePct).toBe(20);
    expect(Math.round(bars[1]!.fillPct)).toBe(33);
  });

  it("preserves the caller's order with sort: 'none' (ordered histogram buckets)", () => {
    const bars = distributionBars(
      [
        { key: '1', label: '1', count: 5 },
        { key: '2-3', label: '2–3', count: 12 },
        { key: '4-9', label: '4–9', count: 3 },
      ],
      'none',
    );
    expect(bars.map((b) => b.key)).toEqual(['1', '2-3', '4-9']);
  });

  it('gives every non-zero row a visible sliver and handles an all-zero set', () => {
    const bars = distributionBars([
      { key: 'a', label: 'a', count: 1 },
      { key: 'b', label: 'b', count: 999 },
    ]);
    expect(bars[1]!.fillPct).toBeGreaterThanOrEqual(2); // the tiny row still shows
    const zero = distributionBars([{ key: 'z', label: 'z', count: 0 }]);
    expect(zero[0]).toMatchObject({ sharePct: 0, fillPct: 0 });
  });
});
