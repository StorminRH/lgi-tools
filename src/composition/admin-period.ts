import type { DateRange } from '@/data/telemetry/types';

export const RANGES = ['7d', '30d', '90d', 'all'] as const;
export type RangeKey = (typeof RANGES)[number];

export const ALL_TIME_FROM = new Date('2025-01-01T00:00:00Z');

export function parseRange(raw: string | string[] | undefined): RangeKey {
  if (typeof raw !== 'string') return '30d';
  return (RANGES as readonly string[]).includes(raw) ? (raw as RangeKey) : '30d';
}

export function rangeFor(key: RangeKey, now: Date = new Date()): DateRange {
  if (key === 'all') return { from: ALL_TIME_FROM, to: now };
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

export function previousRange(key: RangeKey, range: DateRange): DateRange | null {
  if (key === 'all') return null;
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: range.from };
}

export interface Delta {
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

const FLAT_BAND_PCT = 0.5;

export function computeDelta(current: number, previous: number | null): Delta | null {
  if (previous === null) return null;
  if (previous === 0) {
    if (current === 0) return { pct: null, direction: 'flat' };
    return { pct: null, direction: 'up' };
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < FLAT_BAND_PCT) return { pct: 0, direction: 'flat' };
  return { pct: Math.round(pct), direction: pct > 0 ? 'up' : 'down' };
}

export function trendSeries(days: string[], values: number[]) {
  return { points: values.map((y, x) => ({ x, y })), labels: days };
}
