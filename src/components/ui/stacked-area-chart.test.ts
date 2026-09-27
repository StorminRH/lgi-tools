import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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

describe('StackedAreaChart', () => {
  it('draws one layer per band, the upper band only where it has data', () => {
    const html = render([
      { x: 0, label: 'a', values: [10, null] },
      { x: 1, label: 'b', values: [12, 5] },
      { x: 2, label: 'c', values: [14, 6] },
    ]);
    expect(html.match(/data-band="/g)).toHaveLength(2);
    expect(html).toContain('data-band="isk"');
    expect(html).toContain('data-band="assets"');
    expect(html).toContain('aria-label="Worth"');
  });

  it('draws nothing for fewer than two points', () => {
    expect(render([{ x: 0, label: 'a', values: [1, 1] }])).toBe('');
  });
});
