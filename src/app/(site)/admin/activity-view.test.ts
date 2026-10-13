import { expect, test } from 'vitest';
import { deriveActivityView, rangeDayCount } from './activity-view';

const range = {
  from: new Date('2026-07-06T00:00:00Z'),
  to: new Date('2026-07-12T12:00:00Z'),
};

const dailyCounts = [
  { day: '2026-07-06', views: 10 },
  { day: '2026-07-08', views: 20 },
  { day: '2026-07-12', views: 5 },
];

test('deriveActivityView zero-fills the span with moving average, weekend flags, end label and markers, ends on the last day inside a half-open range, and is a no-data view without counts', () => {
  const view = deriveActivityView({
    range,
    dailyCounts,
    prevDailyCounts: null,
    markers: [
      { date: '2026-07-06', label: 'v0' },
      { date: '2026-07-08', label: 'v1' },
      { date: '2026-07-08', label: 'v2' },
      { date: '2026-07-20', label: 'v3' },
    ],
  });
  expect(view.hasData).toBe(true);
  expect(view.labels).toEqual([
    '2026-07-06',
    '2026-07-07',
    '2026-07-08',
    '2026-07-09',
    '2026-07-10',
    '2026-07-11',
    '2026-07-12',
  ]);
  expect(view.points.map((p) => p.y)).toEqual([10, 0, 20, 0, 0, 0, 5]);
  expect(view.weekend).toEqual([false, false, false, false, false, true, true]);
  expect(view.average[0]).toBe(10);
  expect(view.average[2]).toBe(10);
  expect(view.endValue).toBe(5);
  expect(view.totalValue).toBe(35);
  expect(view.endDelta).toBeNull();
  // In-range markers map to their day index, same-day ones merge, and out-of-range ones drop.
  expect(view.eventMarkers).toEqual([
    { x: 0, label: 'v0' },
    { x: 2, label: '2 releases' },
  ]);

  // rangeFor rounds `to` up to the next minute, so late on 2026-07-12 the
  // range ends at 2026-07-13T00:00:00Z. No row can carry that day.
  const halfOpen = deriveActivityView({
    range: { from: new Date('2026-07-06T00:00:00Z'), to: new Date('2026-07-13T00:00:00Z') },
    dailyCounts: [
      { day: '2026-07-06', views: 10 },
      { day: '2026-07-12', views: 5 },
    ],
    prevDailyCounts: null,
    markers: [],
  });
  expect(halfOpen.labels.at(-1)).toBe('2026-07-12');
  expect(halfOpen.labels.length).toBe(7);
  expect(halfOpen.endValue).toBe(5);

  const empty = deriveActivityView({ range, dailyCounts: [], prevDailyCounts: null, markers: [] });
  expect(empty.hasData).toBe(false);
  expect(empty.points).toEqual([]);
});

test('the reference line is the prior total over the range length, not the clamped series length, and absent without prior data', () => {
  const withPrior = deriveActivityView({
    range,
    dailyCounts,
    prevDailyCounts: [{ day: '2026-06-29', views: 70 }],
    markers: [],
  });
  expect(withPrior.referenceLine).toEqual({ value: 10, label: 'prior avg' });

  const clamped = deriveActivityView({
    range: { from: new Date('2026-07-06T00:00:00Z'), to: new Date('2026-07-13T00:00:00Z') },
    dailyCounts: [
      { day: '2026-07-09', views: 20 },
      { day: '2026-07-12', views: 5 },
    ],
    prevDailyCounts: [{ day: '2026-06-30', views: 70 }],
    markers: [],
  });
  expect(clamped.labels.length).toBe(4);
  expect(clamped.referenceLine).toEqual({ value: 10, label: 'prior avg' });

  const emptyPrior = deriveActivityView({ range, dailyCounts, prevDailyCounts: [], markers: [] });
  expect(emptyPrior.referenceLine).toBeNull();
});

test('rangeDayCount rounds the window to whole days, minimum 1', () => {
  expect(rangeDayCount({ from: new Date('2026-07-06T00:00:00Z'), to: new Date('2026-07-13T00:00:00Z') })).toBe(7);
  expect(rangeDayCount({ from: new Date('2026-07-06T00:00:00Z'), to: new Date('2026-07-06T01:00:00Z') })).toBe(1);
});
