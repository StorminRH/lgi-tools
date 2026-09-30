import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { SplitAxisChart } from './split-axis-chart';

const render = (data: { x: number; label: string; upper: number | null; lower: number }[]) =>
  renderToStaticMarkup(
    createElement(SplitAxisChart, {
      data,
      upperTone: 'green',
      lowerTone: 'blue',
      upperDomain: [3_000, 3_400],
      lowerDomain: [150, 210],
      width: 400,
      formatY: String,
      ariaLabel: 'Worth',
      renderTooltip: () => null,
    }),
  );

test('draws two value axes with a break, and nothing for a single point', () => {
  const html = render([
    { x: 0, label: 'a', upper: null, lower: 160 },
    { x: 1, label: 'b', upper: null, lower: 180 },
    { x: 2, label: 'c', upper: 3_340, lower: 199 },
  ]);
  expect(html).toContain('data-axis="upper"');
  expect(html).toContain('data-axis="lower"');
  expect(html).toContain('data-axis-break');
  expect(html.match(/<circle/g)).toHaveLength(1);
  expect(render([{ x: 0, label: 'a', upper: 1, lower: 1 }])).toBe('');
});
