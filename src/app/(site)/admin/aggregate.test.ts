import { describe, expect, it } from 'vitest';
import {
  dayString,
  isWeekend,
  mean,
  movingAverage,
  sum,
  toDayNumber,
  weekOverWeekDelta,
  zeroFillDaily,
} from './aggregate';

describe('toDayNumber / dayString', () => {
  it('round-trips a day string through its integer day number', () => {
    for (const day of ['2025-01-01', '2026-07-13', '2024-02-29']) {
      expect(dayString(toDayNumber(day))).toBe(day);
    }
  });

  it('assigns consecutive integers to consecutive days', () => {
    expect(toDayNumber('2026-07-13') - toDayNumber('2026-07-12')).toBe(1);
  });
});

describe('isWeekend', () => {
  it('flags Saturday and Sunday (UTC) and not weekdays', () => {
    expect(isWeekend('2026-07-11')).toBe(true); // Saturday
    expect(isWeekend('2026-07-12')).toBe(true); // Sunday
    expect(isWeekend('2026-07-13')).toBe(false); // Monday
    expect(isWeekend('2026-07-10')).toBe(false); // Friday
  });
});

describe('zeroFillDaily', () => {
  it('fills absent calendar days with 0 and flags weekends', () => {
    const series = zeroFillDaily(
      [
        { day: '2026-07-10', value: 5 },
        { day: '2026-07-13', value: 8 },
      ],
      '2026-07-10',
      '2026-07-13',
    );
    expect(series.days).toEqual(['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13']);
    expect(series.values).toEqual([5, 0, 0, 8]);
    expect(series.weekend).toEqual([false, true, true, false]);
  });

  it('ignores rows outside the requested span', () => {
    const series = zeroFillDaily(
      [
        { day: '2026-07-09', value: 99 },
        { day: '2026-07-11', value: 3 },
      ],
      '2026-07-10',
      '2026-07-11',
    );
    expect(series.days).toEqual(['2026-07-10', '2026-07-11']);
    expect(series.values).toEqual([0, 3]);
  });

  it('returns a single day when start === end', () => {
    const series = zeroFillDaily([{ day: '2026-07-13', value: 4 }], '2026-07-13', '2026-07-13');
    expect(series.values).toEqual([4]);
  });
});

describe('movingAverage', () => {
  it('averages the days available for early points, then a full trailing window', () => {
    // window 3 over [3,6,9,12]: [3, (3+6)/2, (3+6+9)/3, (6+9+12)/3]
    expect(movingAverage([3, 6, 9, 12], 3)).toEqual([3, 4.5, 6, 9]);
  });

  it('smooths zero-filled gaps toward the mean', () => {
    expect(movingAverage([10, 0, 0, 10], 2)).toEqual([10, 5, 0, 5]);
  });

  it('handles an empty series and a degenerate window', () => {
    expect(movingAverage([], 7)).toEqual([]);
    expect(movingAverage([1, 2], 0)).toEqual([1, 2]);
  });
});

describe('sum / mean', () => {
  it('sums and means, with mean 0 on empty', () => {
    expect(sum([2, 3, 5])).toBe(10);
    expect(mean([2, 4])).toBe(3);
    expect(mean([])).toBe(0);
  });
});

describe('weekOverWeekDelta', () => {
  it('compares the last 7 days against the prior 7', () => {
    const values = [
      ...Array(7).fill(10), // prior week: total 70
      ...Array(7).fill(14), // last week: total 98 → +40%
    ];
    expect(weekOverWeekDelta(values)).toEqual({ pct: 40, direction: 'up' });
  });

  it('is null with fewer than 14 days of history', () => {
    expect(weekOverWeekDelta(Array(13).fill(1))).toBeNull();
  });

  it('reports a brand-new prior week as up with a null pct', () => {
    const values = [...Array(7).fill(0), ...Array(7).fill(5)];
    expect(weekOverWeekDelta(values)).toEqual({ pct: null, direction: 'up' });
  });
});
