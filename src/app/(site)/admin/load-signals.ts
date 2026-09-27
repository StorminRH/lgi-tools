import { cache } from 'react';
import { rangeFor, type RangeKey } from '@/composition/admin-period';
import { isGscConfigured } from '@/data/gsc/constants';
import {
  getCriticalLatencyP95,
  getEsiSuccessRate,
  getGscCronOutcomes,
  getLastCronRuns,
  getMutationSuccessRate,
  getPriceCronOutcomes,
  getReadSuccessRate,
  getSdeCronOutcomes,
} from '@/data/telemetry/queries';
import { readEsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { loadDeployMarkers } from './deploy-markers';
import { getBudgetExhaustionCountShared, getFallbackRateShared } from './esi-source-shared';
import { getLastSyncedAtShared } from './last-synced';
import { loadSection } from './load-section';
import { getEsiRefreshQueueStatsShared } from './queue-stats-shared';
import type { AdminSignals } from './signals';
import { getStaticsReviewShared } from './statics-review-shared';

// One read per request feeds both the attention list and the status cards.
export const loadAdminSignals = cache((rangeKey: RangeKey) =>
  loadSection('admin-signals', async (): Promise<AdminSignals> => {
    const range = rangeFor(rangeKey);
    const gscConfigured = isGscConfigured();
    const [
      lastRuns,
      priceOutcomes,
      sdeOutcomes,
      gscOutcomes,
      gscLastSyncedAt,
      budget,
      fallback,
      budgetExhaustions,
      readSuccess,
      mutationSuccess,
      latencyP95,
      esiSuccess,
      queue,
      staticsReview,
      releases,
    ] = await Promise.all([
      getLastCronRuns(),
      getPriceCronOutcomes(range),
      getSdeCronOutcomes(range),
      getGscCronOutcomes(range),
      gscConfigured ? getLastSyncedAtShared() : Promise.resolve(null),
      readEsiBudgetSnapshot(),
      getFallbackRateShared(range),
      getBudgetExhaustionCountShared(range),
      getReadSuccessRate(range),
      getMutationSuccessRate(range),
      getCriticalLatencyP95(range),
      getEsiSuccessRate(range),
      getEsiRefreshQueueStatsShared(),
      getStaticsReviewShared(),
      loadDeployMarkers(),
    ]);
    return {
      now: range.to,
      crons: { lastRuns, priceOutcomes, sdeOutcomes, gscOutcomes, gscConfigured, gscLastSyncedAt },
      budget,
      fallback,
      budgetExhaustions,
      sli: { readSuccess, mutationSuccess, latencyP95, esiSuccess },
      queue,
      statics: staticsReview
        ? {
            feedVersion: staticsReview.feedVersion,
            totalDifferences: staticsReview.difference.totalDifferences,
          }
        : null,
      releases,
    };
  }),
);
