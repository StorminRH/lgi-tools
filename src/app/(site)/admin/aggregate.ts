import type { Delta } from '@/composition/admin-period';
import { computeDelta } from '@/composition/admin-period';

const MS_PER_DAY = 86_400_000;

export function toDayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
}

export function dayString(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isWeekend(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

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
  const start = toDayNumber(startDay);
  const end = toDayNumber(endDay);
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  const days: string[] = [];
  const values: number[] = [];
  const weekend: boolean[] = [];
  for (let d = start; d <= end; d += 1) {
    const key = dayString(d);
    days.push(key);
    values.push(byDay.get(key) ?? 0);
    weekend.push(isWeekend(key));
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

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

export function weekOverWeekDelta(values: number[]): Delta | null {
  if (values.length < 14) return null;
  return computeDelta(sum(values.slice(-7)), sum(values.slice(-14, -7)));
}
