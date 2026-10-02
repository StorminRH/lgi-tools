import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DistributionBars, distributionBars } from './distribution-bars';

describe('distributionBars', () => {
  it('uses the full population for truncated rankings', () => {
    const [bar] = distributionBars([{ key: 'a', label: 'a', count: 326 }], 'desc', 1205);
    expect(bar!.sharePct).toBeCloseTo(27.054, 2);
  });
  it('sorts high→low and computes share of total plus fill vs the max', () => {
    const bars = distributionBars([
      { key: 'a', label: '/a', count: 20 },
      { key: 'b', label: '/b', count: 60 },
      { key: 'c', label: '/c', count: 20 },
    ]);
    expect(bars.map((b) => b.key)).toEqual(['b', 'a', 'c']);
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
    expect(bars[1]!.fillPct).toBeGreaterThanOrEqual(2);
    const zero = distributionBars([{ key: 'z', label: 'z', count: 0 }]);
    expect(zero[0]).toMatchObject({ sharePct: 0, fillPct: 0 });
  });

  it("fills to each row's share of the total with fill: 'share'", () => {
    const bars = distributionBars(
      [
        { key: 'a', label: 'a', count: 18 },
        { key: 'b', label: 'b', count: 12 },
      ],
      'none',
      undefined,
      'share',
    );
    expect(bars.map((b) => b.fillPct)).toEqual([60, 40]);
  });
});

describe('DistributionBars', () => {
  it('renders each row tone and trailing detail', () => {
    const html = renderToStaticMarkup(
      createElement(DistributionBars, {
        rows: [{ key: 'partial', label: 'partial', count: 6, tone: 'orange', detail: 'avg 4.2 s' }],
      }),
    );
    expect(html).toContain('data-tone="orange"');
    expect(html).toContain('6 · 100% · avg 4.2 s');
  });
});
