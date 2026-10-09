import { cache } from 'react';
import { rangeFor, type RangeKey } from '@/composition/admin-period';
import { isGscConfigured } from '@/data/gsc/constants';
import { fallbackRate } from '@/data/telemetry/cron-stats';
import type { DateRange } from '@/data/telemetry/types';
import { readEsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { loadDeployMarkers } from './deploy-markers';
import { getEsiRefreshQueueStatsShared, getLastSyncedAtShared, getStaticsSummaryShared } from './shared-reads';
import {
  getCapabilityLatencyShared,
  getCapabilityOutcomeStatsShared,
  getCronOutcomesShared,
  getLastCronRunsShared,
  getPriceRefreshDaysShared,
  getPriceSourceDegradationShared,
} from './shared-reads';
import { loadSection } from './load-section';
import { deriveSliSignals, type AdminSignals, type CronSignals, type SliSignals } from './signals';

/** Every tracked cron's latest run and outcomes, for the overview and the health page. */
export async function loadCronSignals(range: DateRange): Promise<CronSignals> {
  const gscConfigured = isGscConfigured();
  const [lastRuns, outcomes, gscLastSyncedAt] = await Promise.all([
    getLastCronRunsShared(),
    getCronOutcomesShared(range),
    gscConfigured ? getLastSyncedAtShared() : Promise.resolve(null),
  ]);
  return {
    lastRuns,
    priceOutcomes: outcomes.cron_prices,
    sdeOutcomes: outcomes.cron_sde,
    gscOutcomes: outcomes.cron_gsc,
    housekeepingOutcomes: outcomes.cron_housekeeping,
    gscConfigured,
    gscLastSyncedAt,
  };
}

// One read per request feeds both the attention list and the status cards.
// Each source is its own section, so one failed read leaves the rest intact.
export const loadAdminSignals = cache(async (rangeKey: RangeKey): Promise<AdminSignals> => {
  const range = rangeFor(rangeKey);
  const [crons, budget, fallback, budgetExhaustions, sli, queue, statics, releases] = await Promise.all([
    loadSection('admin-signals.crons', () => loadCronSignals(range)),
    loadSection('admin-signals.budget', readEsiBudgetSnapshot),
    loadSection('admin-signals.fallback', async () => fallbackRate(await getPriceRefreshDaysShared(range))),
    loadSection('admin-signals.budget-exhaustions', async () => (await getPriceSourceDegradationShared(range)).budgetExhaustions),
    loadSection<SliSignals>('admin-signals.sli', async () => {
      const [outcomes, latency] = await Promise.all([
        loadSection('capability-outcomes', () => getCapabilityOutcomeStatsShared(range)),
        loadSection('capability-latency', () => getCapabilityLatencyShared(range)),
      ]);
      return deriveSliSignals(outcomes, latency);
    }),
    loadSection('admin-signals.queue', getEsiRefreshQueueStatsShared),
    loadSection('admin-signals.statics', getStaticsSummaryShared),
    loadSection('admin-signals.releases', loadDeployMarkers),
  ]);
  return { now: range.to, crons, budget, fallback, budgetExhaustions, sli, queue, statics, releases };
});
