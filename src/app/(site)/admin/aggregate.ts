import { isoDayFromNumber, isoDayNumber, isUtcWeekend } from '@/lib/iso-date';

export interface DailySeries {
  days: string[];
  values: number[];
  weekend: boolean[];
}

export function zeroFillDaily(
  rows: { day: string; value: number }[],
  startDay: string,
  endDay: string,
): DailySeries {
  const start = isoDayNumber(startDay);
  const end = isoDayNumber(endDay);
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  const days: string[] = [];
  const values: number[] = [];
  const weekend: boolean[] = [];
  for (let d = start; d <= end; d += 1) {
    const key = isoDayFromNumber(d);
    days.push(key);
    values.push(byDay.get(key) ?? 0);
    weekend.push(isUtcWeekend(key));
  }
  return { days, values, weekend };
}

export function movingAverage(values: number[], window: number): number[] {
  if (window < 1) return values.slice();
  const out: number[] = [];
  let running = 0;
  for (let i = 0; i < values.length; i += 1) {
    running += values[i]!;
    if (i >= window) running -= values[i - window]!;
    out.push(running / Math.min(i + 1, window));
  }
  return out;
}
