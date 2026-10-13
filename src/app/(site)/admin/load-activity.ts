import type { DateRange } from '@/data/telemetry/types';
import { deriveActivityView } from './activity-view';
import { loadDeployMarkers } from './deploy-markers';
import { getPageViewStatsShared } from './shared-reads';

/**
 * The daily page-view chart and its release markers, for the overview and the
 * traffic page. A card that also needs the page-view days asks the shared read
 * for the same periods, so the request scans them once.
 */
export async function loadActivityView(range: DateRange, previous: DateRange | null) {
  const [views, markers] = await Promise.all([getPageViewStatsShared(range, previous), loadDeployMarkers()]);
  return deriveActivityView({ range, dailyCounts: views.current, prevDailyCounts: views.previous, markers });
}
