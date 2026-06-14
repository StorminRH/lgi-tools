import { describe, expect, it } from 'vitest';
import {
  averageDailyVolume,
  computeHistoryInputs,
  coverage,
  priceVolatility,
  volumeCoefficientOfVariation,
} from './aggregate';
import {
  HISTORY_ADV_WINDOWS,
  HISTORY_STABILITY_WINDOW_DAYS,
} from './constants';
import type { HistoryDailyRow } from './types';

function row(date: string, volume: number, average = 10): HistoryDailyRow {
  return {
    date,
    average,
    highest: average + 1,
    lowest: average - 1,
    volume: BigInt(volume),
    orderCount: 1,
  };
}

// `n` consecutive days ending at `end` (inclusive), each with the same volume.
function consecutive(end: string, n: number, volume: number, average = 10): HistoryDailyRow[] {
  const endDay = Math.floor(Date.parse(`${end}T00:00:00Z`) / 86_400_000);
  const out: HistoryDailyRow[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date((endDay - i) * 86_400_000).toISOString().slice(0, 10);
    out.push(row(d, volume, average));
  }
  return out;
}

describe('averageDailyVolume', () => {
  it('divides total window volume by the window CALENDAR length (zero-days pull it down)', () => {
    const rows = consecutive('2026-06-10', 3, 100); // 3 traded days
    // window 3 ends at asOf: all 3 days present → 300 / 3 = 100.
    expect(averageDailyVolume(rows, 3, '2026-06-10')).toBe(100);
    // window 7: same 300 units spread over 7 calendar days → 300 / 7.
    expect(averageDailyVolume(rows, 7, '2026-06-10')).toBeCloseTo(300 / 7, 6);
  });

  it('excludes rows outside the trailing window', () => {
    const rows = [row('2026-06-01', 999), ...consecutive('2026-06-10', 2, 50)];
    // window 3 = [2026-06-08, 2026-06-10]: only the two 50s count → 100 / 3.
    expect(averageDailyVolume(rows, 3, '2026-06-10')).toBeCloseTo(100 / 3, 6);
  });

  it('returns null when the window holds no data', () => {
    expect(averageDailyVolume([], 7, '2026-06-10')).toBeNull();
    expect(averageDailyVolume([row('2026-01-01', 100)], 7, '2026-06-10')).toBeNull();
  });
});

describe('volumeCoefficientOfVariation', () => {
  it('zero-fills traded-nothing days so sporadic demand reads as inconsistent', () => {
    // window 4, two days @ 100, two absent (0). mean = 200/4 = 50.
    // var = [2·(100-50)² + 2·(0-50)²]/4 = [2·2500 + 2·2500]/4 = 2500 → sd 50 → CV 1.0
    const rows = consecutive('2026-06-10', 2, 100);
    expect(volumeCoefficientOfVariation(rows, 4, '2026-06-10')).toBeCloseTo(1.0, 6);
  });

  it('is 0 for perfectly steady daily volume across the whole window', () => {
    const rows = consecutive('2026-06-10', 5, 100);
    expect(volumeCoefficientOfVariation(rows, 5, '2026-06-10')).toBe(0);
  });

  it('returns null when the window has no data', () => {
    expect(volumeCoefficientOfVariation([], 30, '2026-06-10')).toBeNull();
  });
});

describe('priceVolatility', () => {
  it('is the coefficient of variation of daily average prices over traded days', () => {
    // prices 8, 10, 12 → mean 10, var = (4+0+4)/3 = 8/3, sd = √(8/3), CV = sd/10.
    const rows = [
      row('2026-06-08', 10, 8),
      row('2026-06-09', 10, 10),
      row('2026-06-10', 10, 12),
    ];
    expect(priceVolatility(rows, 7, '2026-06-10')).toBeCloseTo(Math.sqrt(8 / 3) / 10, 6);
  });

  it('is 0 for a flat price and null for fewer than two priced days', () => {
    expect(priceVolatility(consecutive('2026-06-10', 4, 100, 5), 7, '2026-06-10')).toBe(0);
    expect(priceVolatility([row('2026-06-10', 100, 5)], 7, '2026-06-10')).toBeNull();
  });
});

describe('coverage', () => {
  it('counts distinct days with data inside the window', () => {
    const rows = [row('2026-05-01', 1), ...consecutive('2026-06-10', 3, 1)];
    expect(coverage(rows, 7, '2026-06-10')).toBe(3);
  });
});

describe('computeHistoryInputs', () => {
  it('anchors asOf to the latest row and fills every ADV window', () => {
    const rows = consecutive('2026-06-10', 30, 100, 9);
    const inputs = computeHistoryInputs(34, rows);
    expect(inputs.typeId).toBe(34);
    expect(inputs.latestDate).toBe('2026-06-10');
    expect(inputs.averageDailyVolume.map((w) => w.days)).toEqual([...HISTORY_ADV_WINDOWS]);
    // 30 steady days → ADV over the 7- and 30-day windows is the daily volume.
    expect(inputs.averageDailyVolume.find((w) => w.days === 7)?.adv).toBe(100);
    expect(inputs.averageDailyVolume.find((w) => w.days === 30)?.adv).toBe(100);
    expect(inputs.volumeCv).toBe(0);
    expect(inputs.priceVolatility).toBe(0);
    expect(inputs.daysCovered).toBe(HISTORY_STABILITY_WINDOW_DAYS);
  });

  it('returns an all-null shell for an empty series', () => {
    const inputs = computeHistoryInputs(99, []);
    expect(inputs.latestDate).toBeNull();
    expect(inputs.volumeCv).toBeNull();
    expect(inputs.priceVolatility).toBeNull();
    expect(inputs.daysCovered).toBe(0);
    expect(inputs.averageDailyVolume.every((w) => w.adv === null)).toBe(true);
  });
});
