import { cache } from 'react';
import { getWhStaticsOperatorReview, getWhStaticsOperatorSummary } from '@/composition/wh-statics-refresh';
import { getEsiRefreshQueueStats } from '@/data/esi-refresh-jobs/queries';
import { getLastSyncedAt, getLatestReportDate, getSearchTrend } from '@/data/gsc/queries';
import {
  getCronOutcomes,
  getLastCronRuns,
  getPageViewRankings,
  getPageViewStats,
  getPriceRefreshDays,
  getPriceSourceDegradation,
} from '@/data/telemetry/queries';
import { getCapabilityLatency, getCapabilityOutcomeStats } from '@/data/telemetry/sli-breakdown';
import type { DateRange } from '@/data/telemetry/types';
import { getUserOwningCharacter, listAdminUsers } from '@/platform/auth/admin-users';

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


// Search, statics and accounts

/** Daily search totals, read once for every card that covers the same window. */
export const getSearchTrendShared = sharedRangeRead(getSearchTrend);
/** The pending statics version and diff size; only /admin/statics needs the full review. */
export const getStaticsSummaryShared = cache(getWhStaticsOperatorSummary);

// Telemetry
export const getCapabilityOutcomeStatsShared = sharedRangeRead(getCapabilityOutcomeStats);
export const getCapabilityLatencyShared = sharedRangeRead(getCapabilityLatency);
export const getCronOutcomesShared = sharedRangeRead(getCronOutcomes);
export const getLastCronRunsShared = cache(getLastCronRuns);
export const getPriceRefreshDaysShared = sharedRangeRead(getPriceRefreshDays);
export const getPriceSourceDegradationShared = sharedRangeRead(getPriceSourceDegradation);

/** As `sharedRangeRead`, for reads over a range and the period before it. */
function sharedPeriodRead<T>(
  load: (range: DateRange, previous: DateRange | null) => Promise<T>,
): (range: DateRange, previous: DateRange | null) => Promise<T> {
  const read = cache((from: string, to: string, previousFrom: string | null, previousTo: string | null) =>
    load(
      { from: new Date(from), to: new Date(to) },
      previousFrom === null || previousTo === null ? null : { from: new Date(previousFrom), to: new Date(previousTo) },
    ),
  );
  return (range, previous) =>
    read(
      range.from.toISOString(),
      range.to.toISOString(),
      previous?.from.toISOString() ?? null,
      previous?.to.toISOString() ?? null,
    );
}

export const getPageViewStatsShared = sharedPeriodRead(getPageViewStats);

// Traffic, search, queue, statics and users

/** The top pages, entry pages and referrers, read once for the three cards that rank them. */
export const getPageViewRankingsShared = sharedRangeRead((range) => getPageViewRankings(range, 10));
/** The newest finalised Google reporting day, which every dated search card counts back from. */
export const getLatestReportDateShared = cache(getLatestReportDate);
/** The admin accounts, read once for the Admins card and to keep admins out of search results. */
export const listAdminUsersShared = cache(listAdminUsers);
/** The account holding the env superadmin's character, read alongside the admin list. */
export const getUserOwningCharacterShared = cache(getUserOwningCharacter);
