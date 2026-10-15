import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { DistributionBars, distributionBars } from './distribution-bars';

test('distributionBars uses the full population for truncated rankings', () => {
  const [bar] = distributionBars([{ key: 'a', label: 'a', count: 326 }], 'desc', 1205);
  expect(bar!.sharePct).toBeCloseTo(27.054, 2);
});

test('distributionBars sorts high→low and computes share of total plus fill vs the max', () => {
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

test("distributionBars preserves the caller's order with sort: 'none' (ordered histogram buckets)", () => {
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

test('distributionBars gives every non-zero row a visible sliver and handles an all-zero set', () => {
  const bars = distributionBars([
    { key: 'a', label: 'a', count: 1 },
    { key: 'b', label: 'b', count: 999 },
  ]);
  expect(bars[1]!.fillPct).toBeGreaterThanOrEqual(2);
  const zero = distributionBars([{ key: 'z', label: 'z', count: 0 }]);
  expect(zero[0]).toMatchObject({ sharePct: 0, fillPct: 0 });
});

test("distributionBars fills to each row's share of the total with fill: 'share'", () => {
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

test('DistributionBars shows each row\'s tone and figures, and a second line of detail only under the row that has one', () => {
  const toned = renderToStaticMarkup(
    createElement(DistributionBars, {
      rows: [{ key: 'partial', label: 'partial', count: 6, tone: 'orange', detail: 'avg 4.2 s' }],
    }),
  );
  expect(toned).toContain('data-tone="orange"');
  expect(toned).toContain('6 · 100% · avg 4.2 s');

  const html = renderToStaticMarkup(
    createElement(DistributionBars, {
      total: 400,
      formatCount: (n: number) => `${n} clk`,
      rows: [
        { key: 'q', label: 'wormhole statics', count: 16, sub: '1,204 impr · 1.3% CTR · pos 4.2' },
        { key: 'r', label: 'c5 sites', count: 8 },
      ],
    }),
  );
  expect(html).toContain('16 clk · 4.0%');
  const [first, second] = html.split('</li>');
  expect(first).toMatch(/<div [^>]*>1,204 impr · 1\.3% CTR · pos 4\.2<\/div>$/);
  expect(second).toContain('c5 sites');
  expect(second).not.toContain('impr');
});
