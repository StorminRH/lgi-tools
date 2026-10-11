import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnnotatedDailyChart } from './annotated-daily-chart';
import { toneHex } from './tones';

const PLOT_LEFT = 44;

function render(
  days: number,
  width: number,
  referenceLine: { value: number; label: string } | null = null,
): string {
  return renderToStaticMarkup(
    createElement(AnnotatedDailyChart, {
      points: Array.from({ length: days }, (_, x) => ({ x, y: 12 })),
      average: Array.from({ length: days }, () => 12),
      labels: Array.from({ length: days }, (_, x) => `2026-10-${String(8 + x).padStart(2, '0')}`),
      weekend: Array.from({ length: days }, () => false),
      referenceLine,
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

// The date labels under the plot: the default height of 220 puts them on y=214.
function tickLabels(html: string): { x: number; label: string }[] {
  return [...html.matchAll(/<text x="([\d.]+)" y="214" text-anchor="\w+"[^>]*>(2026-10-\d\d)<\/text>/g)].map((m) => ({
    x: Number(m[1]),
    label: m[2]!,
  }));
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

  it('takes a tab stop read by the arrow keys and labels at most five days under their bars', () => {
    const html = render(30, 900, { value: 20, label: 'target' });
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Page views by day; use the arrow keys to read each day"');
    expect(html).toContain('role="img" aria-label="Page views by day"');
    expect(html).toMatch(/<text [^>]*>target<\/text>/);

    // Each label sits on the centre of its day's bar.
    const drawn = bars(html);
    const under = (day: number, label: string) => ({ x: expect.closeTo(drawn[day]!.x + drawn[day]!.width / 2, 9), label });
    expect(tickLabels(html)).toEqual([
      under(0, '2026-10-08'),
      under(7, '2026-10-15'),
      under(15, '2026-10-23'),
      under(22, '2026-10-30'),
      under(29, '2026-10-37'),
    ]);

    const oneDay = render(1, 900);
    const [lone] = bars(oneDay);
    expect(tickLabels(oneDay)).toEqual([{ x: expect.closeTo(lone!.x + lone!.width / 2, 9), label: '2026-10-08' }]);
    expect(render(0, 900)).toBe('');
  });
});
