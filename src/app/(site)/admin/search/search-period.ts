import type { DateRange } from '@/data/telemetry/types';
import { DAY_MS, isoDayStartMs } from '@/lib/iso-date';
import { ALL_TIME_FROM, RANGE_DAYS, type RangeKey } from '../period';

/** Google reports whole dates. Both ends are inclusive and windows never overlap. */
export function searchPeriods(key: RangeKey, latestDay: string): {
  range: DateRange;
  previous: DateRange | null;
  /** Report days in `range`, counting both ends. */
  days: number;
} {
  const to = new Date(isoDayStartMs(latestDay));
  if (key === 'all') {
    return {
      range: { from: ALL_TIME_FROM, to },
      previous: null,
      days: Math.round((to.getTime() - ALL_TIME_FROM.getTime()) / DAY_MS) + 1,
    };
  }
  const days = RANGE_DAYS[key];
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);
  return {
    range: { from, to },
    previous: {
      from: new Date(from.getTime() - days * DAY_MS),
      to: new Date(from.getTime() - DAY_MS),
    },
    days,
  };
}
