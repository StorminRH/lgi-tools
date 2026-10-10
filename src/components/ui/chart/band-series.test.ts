import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { toneHex } from '../tones';
import { BandSeries } from './band-series';

type Day = { x: number; value: number | null };

const render = (values: (number | null)[], strokeOpacity?: number) =>
  renderToStaticMarkup(
    createElement(
      'svg',
      null,
      createElement(BandSeries<Day>, {
        points: values.map((value, x) => ({ x, value })),
        x: (day) => day.x * 10,
        y0: () => 100,
        y1: (day) => 100 - (day.value ?? 0),
        defined: (day) => day.value !== null,
        color: toneHex.green,
        fillOpacity: 0.2,
        strokeOpacity,
      }),
    ),
  );

const dots = (html: string) => [...html.matchAll(/<circle cx="(\d+)" cy="(\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);

test('dots each point that has data but no neighbour with data, at its top edge', () => {
  expect(dots(render([1, null, 2, null, 3]))).toEqual([
    [0, 99],
    [20, 98],
    [40, 97],
  ]);
  expect(dots(render([1, 2, null, 3]))).toEqual([[30, 97]]);

  const empty = render([null, null, null]);
  expect(dots(empty)).toEqual([]);
  expect(empty).not.toContain('d="M');
});

test('draws the line at width 1.5 with no stroke-opacity unless one is given', () => {
  const plain = render([1, 2]);
  expect(plain).toContain('stroke-width="1.5"');
  expect(plain).not.toContain('stroke-opacity');
  expect(render([1, 2], 0.7)).toContain('stroke-opacity="0.7"');
});
