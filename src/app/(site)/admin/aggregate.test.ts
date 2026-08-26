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

describe('admin aggregate', () => {
  it('fills calendar days, smooths series, and compares week over week', () => {
    for (const day of ['2025-01-01', '2026-07-13', '2024-02-29']) {
      expect(dayString(toDayNumber(day))).toBe(day);
    }
    expect(toDayNumber('2026-07-13') - toDayNumber('2026-07-12')).toBe(1);
    expect(isWeekend('2026-07-11')).toBe(true);
    expect(isWeekend('2026-07-12')).toBe(true);
    expect(isWeekend('2026-07-13')).toBe(false);

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
    expect(
      zeroFillDaily(
        [
          { day: '2026-07-09', value: 99 },
          { day: '2026-07-11', value: 3 },
        ],
        '2026-07-10',
        '2026-07-11',
      ).values,
    ).toEqual([0, 3]);
    expect(
      zeroFillDaily([{ day: '2026-07-13', value: 4 }], '2026-07-13', '2026-07-13').values,
    ).toEqual([4]);

    expect(movingAverage([3, 6, 9, 12], 3)).toEqual([3, 4.5, 6, 9]);
    expect(movingAverage([10, 0, 0, 10], 2)).toEqual([10, 5, 0, 5]);
    expect(movingAverage([], 7)).toEqual([]);
    expect(movingAverage([1, 2], 0)).toEqual([1, 2]);
    expect(sum([2, 3, 5])).toBe(10);
    expect(mean([2, 4])).toBe(3);
    expect(mean([])).toBe(0);

    expect(weekOverWeekDelta([...Array(7).fill(10), ...Array(7).fill(14)])).toEqual({
      pct: 40,
      direction: 'up',
    });
    expect(weekOverWeekDelta(Array(13).fill(1))).toBeNull();
    expect(weekOverWeekDelta([...Array(7).fill(0), ...Array(7).fill(5)])).toEqual({
      pct: null,
      direction: 'up',
    });
  });
});
