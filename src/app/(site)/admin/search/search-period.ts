import { ALL_TIME_FROM, type RangeKey } from '@/composition/admin-period';
import type { DateRange } from '@/data/telemetry/types';

const DAY_MS = 86_400_000;

/** Google reports whole dates. Both ends are inclusive and windows never overlap. */
export function searchPeriods(key: RangeKey, latestDay: string): {
  range: DateRange;
  previous: DateRange | null;
} {
  const to = new Date(`${latestDay}T00:00:00Z`);
  if (key === 'all') return { range: { from: ALL_TIME_FROM, to }, previous: null };
  const days = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);
  return {
    range: { from, to },
    previous: {
      from: new Date(from.getTime() - days * DAY_MS),
      to: new Date(from.getTime() - DAY_MS),
    },
  };
}
