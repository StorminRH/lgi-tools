// Range parsing, period-over-period delta math, and chart serialization for
// the admin dashboard. Route-level composition: spans telemetry and GSC, both
// of which take the same { from, to } window shape.

import type { DateRange } from '@/data/telemetry/types';

export const RANGES = ['7d', '30d', '90d', 'all'] as const;
export type RangeKey = (typeof RANGES)[number];

// Date floor for `all` is set to a year before the first user is plausibly
// active; in practice the table only goes back to 2.8.4's deploy day.
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

/**
 * The equal-length window immediately before `range`, for period-over-period
 * deltas. `all` has no previous window — returns null, and the KPI renders
 * without a delta.
 */
export function previousRange(key: RangeKey, range: DateRange): DateRange | null {
  if (key === 'all') return null;
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: range.from };
}

export interface Delta {
  /** Percent change vs the previous window; null when previous was 0 ("new"). */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

// Within this band the change reads as noise, not a trend.
const FLAT_BAND_PCT = 0.5;

/**
 * Period-over-period delta. Null when there is no previous window to compare
 * against (`all` range); `pct: null` when the previous window was zero (the
 * metric is new, a ratio would be meaningless).
 */
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

// A day-indexed series → serializable trend props (x = ordinal index; the day
// strings, in ascending query order, label each point). The formatters live in
// the client chart wrappers, so only these plain arrays cross the boundary.
// Lives here (a server-safe module) rather than charts.tsx — exports of a
// 'use client' module become client references a Server Component can't call.
export function trendSeries(days: string[], values: number[]) {
  return { points: values.map((y, x) => ({ x, y })), labels: days };
}
