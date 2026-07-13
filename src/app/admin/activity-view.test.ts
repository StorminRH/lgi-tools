import { describe, expect, it } from 'vitest';
import { dedupeMarkersByDay, deriveActivityView, rangeDayCount } from './activity-view';

const range = {
  from: new Date('2026-07-06T00:00:00Z'),
  to: new Date('2026-07-12T12:00:00Z'),
};

const dailyCounts = [
  { day: '2026-07-06', totalEvents: 10 },
  { day: '2026-07-08', totalEvents: 20 },
  { day: '2026-07-12', totalEvents: 5 },
];

describe('dedupeMarkersByDay', () => {
  it('keeps a single version, collapses several on one day to a count', () => {
    expect(
      dedupeMarkersByDay([
        { date: '2026-07-08', label: 'v1' },
        { date: '2026-07-08', label: 'v2' },
        { date: '2026-07-10', label: 'v3' },
      ]),
    ).toEqual([
      { date: '2026-07-08', label: '2 deploys' },
      { date: '2026-07-10', label: 'v3' },
    ]);
  });
});

describe('deriveActivityView', () => {
  it('zero-fills the span, adds the moving average, weekend flags, and end label', () => {
    const view = deriveActivityView({
      range,
      dailyCounts,
      prevDailyCounts: null,
      markers: [],
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
    expect(view.average[2]).toBe(10); // (10 + 0 + 20) / 3
    expect(view.endValue).toBe(5);
    expect(view.endDelta).toBeNull(); // < 14 days
  });

  it('reference line = prior-window average, suppressed when there is no prior data', () => {
    const withPrior = deriveActivityView({
      range,
      dailyCounts,
      prevDailyCounts: [{ day: '2026-06-29', totalEvents: 70 }],
      markers: [],
    });
    expect(withPrior.referenceLine).toEqual({ value: 10, label: 'prior avg' }); // 70 / 7 days

    const emptyPrior = deriveActivityView({
      range,
      dailyCounts,
      prevDailyCounts: [],
      markers: [],
    });
    expect(emptyPrior.referenceLine).toBeNull();
  });

  it('maps in-range markers to their day index and drops out-of-range ones', () => {
    const view = deriveActivityView({
      range,
      dailyCounts,
      prevDailyCounts: null,
      markers: [
        { date: '2026-07-08', label: 'v1' },
        { date: '2026-07-08', label: 'v2' },
        { date: '2026-07-20', label: 'v3' },
      ],
    });
    expect(view.eventMarkers).toEqual([{ x: 2, label: '2 deploys' }]);
  });

  it('returns an empty, no-data view when there are no daily counts', () => {
    const view = deriveActivityView({ range, dailyCounts: [], prevDailyCounts: null, markers: [] });
    expect(view.hasData).toBe(false);
    expect(view.points).toEqual([]);
  });
});

describe('rangeDayCount', () => {
  it('rounds the window to whole days, minimum 1', () => {
    expect(rangeDayCount({ from: new Date('2026-07-06T00:00:00Z'), to: new Date('2026-07-13T00:00:00Z') })).toBe(7);
    expect(rangeDayCount({ from: new Date('2026-07-06T00:00:00Z'), to: new Date('2026-07-06T01:00:00Z') })).toBe(1);
  });
});
