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
// Each source is its own section, so one failed read leaves the rest intact.
export const loadAdminSignals = cache(async (rangeKey: RangeKey): Promise<AdminSignals> => {
  const range = rangeFor(rangeKey);
  const gscConfigured = isGscConfigured();
  const [crons, budget, fallback, budgetExhaustions, sli, queue, statics, releases] = await Promise.all([
    loadSection('admin-signals.crons', async () => {
      const [lastRuns, priceOutcomes, sdeOutcomes, gscOutcomes, gscLastSyncedAt] = await Promise.all([
        getLastCronRuns(),
        getPriceCronOutcomes(range),
        getSdeCronOutcomes(range),
        getGscCronOutcomes(range),
        gscConfigured ? getLastSyncedAtShared() : Promise.resolve(null),
      ]);
      return { lastRuns, priceOutcomes, sdeOutcomes, gscOutcomes, gscConfigured, gscLastSyncedAt };
    }),
    loadSection('admin-signals.budget', readEsiBudgetSnapshot),
    loadSection('admin-signals.fallback', () => getFallbackRateShared(range)),
    loadSection('admin-signals.budget-exhaustions', () => getBudgetExhaustionCountShared(range)),
    loadSection('admin-signals.sli', async () => {
      const [readSuccess, mutationSuccess, latencyP95, esiSuccess] = await Promise.all([
        getReadSuccessRate(range),
        getMutationSuccessRate(range),
        getCriticalLatencyP95(range),
        getEsiSuccessRate(range),
      ]);
      return { readSuccess, mutationSuccess, latencyP95, esiSuccess };
    }),
    loadSection('admin-signals.queue', getEsiRefreshQueueStatsShared),
    loadSection('admin-signals.statics', async () => {
      const review = await getStaticsReviewShared();
      return review
        ? { feedVersion: review.feedVersion, totalDifferences: review.difference.totalDifferences }
        : null;
    }),
    loadSection('admin-signals.releases', loadDeployMarkers),
  ]);
  return { now: range.to, crons, budget, fallback, budgetExhaustions, sli, queue, statics, releases };
});
