import { expect, test } from 'vitest';
import { placeTooltip } from './tooltip-placement';

const box = { width: 120, height: 60 };
const bounds = { width: 500, height: 200 };

test('places a tooltip above the point and clamps it inside the chart', () => {
  expect(placeTooltip({ x: 250, y: 150 }, box, bounds)).toEqual({ x: 190, y: 80 });
  expect(placeTooltip({ x: 495, y: 120 }, box, bounds)).toEqual({ x: 365, y: 90 });
  expect(placeTooltip({ x: 5, y: 120 }, box, bounds)).toEqual({ x: 15, y: 90 });
  expect(placeTooltip({ x: 250, y: 20 }, box, bounds)).toEqual({ x: 190, y: 0 });
  expect(placeTooltip({ x: 495, y: 5 }, box, bounds)).toEqual({ x: 365, y: 0 });
  expect(placeTooltip({ x: 495, y: 199 }, box, bounds)).toEqual({ x: 365, y: 140 });
  expect(placeTooltip({ x: 50, y: 50 }, { width: 600, height: 60 }, bounds)).toEqual({ x: 0, y: 20 });
});
