import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { TrendChart } from './trend-chart';

const render = (days: number) =>
  renderToStaticMarkup(
    createElement(TrendChart, {
      data: Array.from({ length: days }, (_, x) => ({ x, y: x * 3 })),
      labels: Array.from({ length: days }, (_, x) => `day ${x}`),
      width: 400,
      formatTick: (label) => `tick:${label}`,
      ariaLabel: 'Balance',
    }),
  );

// The date labels under the plot: default height 200 puts them on y=194.
const tickLabels = (html: string) =>
  [...html.matchAll(/<text x="([\d.]+)" y="194" text-anchor="(\w+)"[^>]*>tick:(day \d+)<\/text>/g)].map((m) => ({
    x: Number(m[1]),
    anchor: m[2],
    label: m[3],
  }));

test('a trend takes a tab stop read by the arrow keys, labels five days on their points, and draws nothing without data', () => {
  const html = render(30);
  expect(html).toContain('tabindex="0"');
  expect(html).toContain('aria-label="Balance; use the arrow keys to read each day"');
  expect(html).toContain('role="img" aria-label="Balance"');
  // 30 days across the 44..392 plot is 12px a day.
  expect(tickLabels(html)).toEqual([
    { x: 44, anchor: 'start', label: 'day 0' },
    { x: 128, anchor: 'middle', label: 'day 7' },
    { x: 224, anchor: 'middle', label: 'day 15' },
    { x: 308, anchor: 'middle', label: 'day 22' },
    { x: 392, anchor: 'end', label: 'day 29' },
  ]);
  expect(html.match(/class="visx-area-closed"/g)).toHaveLength(1);
  expect(html.match(/class="visx-linepath"/g)).toHaveLength(1);

  expect(render(0)).toBe('');
});
