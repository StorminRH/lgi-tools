import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnnotatedDailyChart } from './annotated-daily-chart';
import { toneHex } from './tones';

const PLOT_LEFT = 44;

function render(days: number, width: number): string {
  return renderToStaticMarkup(
    createElement(AnnotatedDailyChart, {
      points: Array.from({ length: days }, (_, x) => ({ x, y: 12 })),
      average: Array.from({ length: days }, () => 12),
      labels: Array.from({ length: days }, (_, x) => `2026-10-${String(8 + x).padStart(2, '0')}`),
      weekend: Array.from({ length: days }, () => false),
      referenceLine: null,
      endLabel: { valueText: '12', deltaText: null, deltaHex: null },
      width,
      ariaLabel: 'Page views by day',
    }),
  );
}

function bars(html: string): { x: number; width: number }[] {
  const fill = toneHex.blue;
  return [...html.matchAll(new RegExp(`<rect x="([\\d.]+)" y="[\\d.]+" width="([\\d.]+)"[^>]*fill="${fill}"`, 'g'))].map(
    (m) => ({ x: Number(m[1]), width: Number(m[2]) }),
  );
}

function endLabelX(html: string): number {
  const match = /<text x="([\d.]+)" y="[\d.]+" class="[^"]*text-label"[^>]*>12<\/text>/.exec(html);
  if (!match) throw new Error('no end label');
  return Number(match[1]);
}

describe('AnnotatedDailyChart geometry', () => {
  it('draws one day of data inside the plot, clear of the value-axis labels, with its end label beside it', () => {
    const html = render(1, 900);
    const [bar] = bars(html);
    expect(bar).toBeDefined();
    expect(bar!.x).toBeGreaterThanOrEqual(PLOT_LEFT);
    const barRight = bar!.x + bar!.width;
    expect(endLabelX(html) - barRight).toBe(5);
  });

  it('keeps the first and last of many bars inside the plot and the end label in the right margin', () => {
    const width = 900;
    const plotRight = width - 66;
    const drawn = bars(render(30, width));
    expect(drawn).toHaveLength(30);
    expect(drawn[0]!.x).toBeGreaterThanOrEqual(PLOT_LEFT);
    const last = drawn.at(-1)!;
    expect(last.x + last.width).toBeLessThanOrEqual(plotRight + 1e-9);
    expect(endLabelX(render(30, width))).toBe(plotRight + 5);
  });
});
