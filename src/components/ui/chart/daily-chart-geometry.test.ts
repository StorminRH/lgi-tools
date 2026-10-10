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
      plotLeft: 44,
      plotRight: 244,
    });
    expect(model.yMax).toBe(30);
    expect(model.refValue).toBe(12);
    expect(model.lastAvg).toBe(13);
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
      plotLeft: 44,
      plotRight: 244,
    });
    expect(model.refValue).toBeNull();
  });

  it('handles an empty series without throwing', () => {
    const model = dailyChartModel({
      points: [],
      average: [],
      labels: [],
      referenceLine: null,
      plotLeft: 44,
      plotRight: 244,
    });
    expect(model).toMatchObject({ values: [], hover: [], barW: 1, yMax: 1 });
  });
});

describe('dailyChartModel x geometry', () => {
  const series = (n: number) => ({
    points: Array.from({ length: n }, (_, x) => ({ x, y: 12 })),
    average: Array.from({ length: n }, () => 12),
    labels: Array.from({ length: n }, (_, x) => `day ${x}`),
    referenceLine: null,
  });

  it('insets the first and last bars so neither crosses the plot edges', () => {
    const model = dailyChartModel({ ...series(30), plotLeft: 44, plotRight: 454 });
    const [first, last] = model.xRange;
    expect(first - model.barW / 2).toBeCloseTo(44);
    expect(last + model.barW / 2).toBeCloseTo(454);
    expect(model.endX).toBeCloseTo(459);
  });

  it('keeps a single day clear of the value-axis labels with its end label beside it', () => {
    // One day of data on a wide 30-day card: the bar used to straddle the
    // plot's left edge, over the tick labels, and the end label sat ~800px away.
    const model = dailyChartModel({ ...series(1), plotLeft: 44, plotRight: 854 });
    expect(model.barW).toBe(26);
    const barLeft = model.xRange[0] - model.barW / 2;
    expect(barLeft).toBe(44);
    expect(model.endX).toBe(barLeft + model.barW + 5);
    expect(model.endX).toBeLessThan(100);
  });
});
