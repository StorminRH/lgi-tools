import { describe, expect, it } from 'vitest';
import { dailyChartModel } from './daily-chart-geometry';

const points = [
  { x: 0, y: 10 },
  { x: 1, y: 0 },
  { x: 2, y: 30 },
];

describe('dailyChartModel', () => {
  it('derives axis ceiling, bar width, reference, last average, and hover data', () => {
    const model = dailyChartModel({
      points,
      average: [10, 5, 13],
      labels: ['2026-07-06', '2026-07-07', '2026-07-08'],
      referenceLine: { value: 12, label: 'prior avg' },
      plotWidth: 200,
    });
    // yMax spans the biggest of values/average/reference (30), never below it.
    expect(model.yMax).toBe(30);
    expect(model.refValue).toBe(12);
    expect(model.lastAvg).toBe(13); // the final moving-average value
    expect(model.values).toEqual([10, 0, 30]);
    expect(model.barW).toBeGreaterThan(0);
    expect(model.hover[1]).toEqual({ x: 1, y: 0, label: '2026-07-07', avg: 5 });
  });

  it('suppresses the reference value when there is no reference line', () => {
    const model = dailyChartModel({
      points,
      average: [10, 5, 13],
      labels: ['a', 'b', 'c'],
      referenceLine: null,
      plotWidth: 200,
    });
    expect(model.refValue).toBeNull();
  });

  it('handles an empty series without throwing', () => {
    const model = dailyChartModel({
      points: [],
      average: [],
      labels: [],
      referenceLine: null,
      plotWidth: 200,
    });
    expect(model).toMatchObject({ xs: [], values: [], hover: [], barW: 1, yMax: 1 });
  });
});
