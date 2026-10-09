import { cache } from 'react';
import { getWhStaticsOperatorReview } from '@/composition/wh-statics-refresh';
import { getEsiRefreshQueueStats } from '@/data/esi-refresh-jobs/queries';
import { getLastSyncedAt, getSearchTrend } from '@/data/gsc/queries';
import { getBudgetExhaustionCount, getFallbackRate } from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';

// Reads that several cards, the rail, or the layout ask for in one request.
// Each runs once per request however many callers it has.

/**
 * React `cache` matches arguments by identity, so two equal `Date`s miss.
 * The range is keyed on its ISO strings instead.
 */
function sharedRangeRead<T>(load: (range: DateRange) => Promise<T>): (range: DateRange) => Promise<T> {
  const read = cache((from: string, to: string) => load({ from: new Date(from), to: new Date(to) }));
  return (range) => read(range.from.toISOString(), range.to.toISOString());
}

export const getEsiRefreshQueueStatsShared = cache(getEsiRefreshQueueStats);
export const getStaticsReviewShared = cache(getWhStaticsOperatorReview);
export const getLastSyncedAtShared = cache(getLastSyncedAt);

export const getFallbackRateShared = sharedRangeRead(getFallbackRate);
export const getBudgetExhaustionCountShared = sharedRangeRead(getBudgetExhaustionCount);

// Search, statics and accounts

/** Daily search totals, read once for every card that covers the same window. */
export const getSearchTrendShared = sharedRangeRead(getSearchTrend);
