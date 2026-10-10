import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { StackedAreaChart } from './stacked-area-chart';

const bands = [
  { key: 'isk', tone: 'blue' as const },
  { key: 'assets', tone: 'green' as const },
];

const render = (data: { x: number; label: string; values: (number | null)[] }[]) =>
  renderToStaticMarkup(
    createElement(StackedAreaChart, {
      data,
      bands,
      width: 400,
      formatY: String,
      ariaLabel: 'Worth',
      renderTooltip: () => null,
    }),
  );

test('draws one layer per band, a dot when a band starts on the last point, and nothing for one point', () => {
  const html = render([
    { x: 0, label: 'a', values: [10, null] },
    { x: 1, label: 'b', values: [12, 5] },
    { x: 2, label: 'c', values: [14, 6] },
  ]);
  expect(html.match(/data-band="/g)).toHaveLength(2);
  expect(html).toContain('data-band="isk"');
  expect(html).toContain('data-band="assets"');
  expect(html).toContain('aria-label="Worth"');

  const late = render([
    { x: 0, label: 'a', values: [10, null] },
    { x: 1, label: 'b', values: [12, null] },
    { x: 2, label: 'c', values: [14, 6] },
  ]);
  expect(late.match(/<circle/g)).toHaveLength(1);
  expect(render([{ x: 0, label: 'a', values: [1, 1] }])).toBe('');
});

test('a band value left off a point is a gap, drawn the same as a null one', () => {
  const missing = render([
    { x: 0, label: 'a', values: [10, 5] },
    { x: 1, label: 'b', values: [12] },
    { x: 2, label: 'c', values: [14, 6] },
  ]);
  const nulled = render([
    { x: 0, label: 'a', values: [10, 5] },
    { x: 1, label: 'b', values: [12, null] },
    { x: 2, label: 'c', values: [14, 6] },
  ]);
  expect(nulled.match(/<circle/g)).toHaveLength(2);
  expect(missing).toBe(nulled);
});
