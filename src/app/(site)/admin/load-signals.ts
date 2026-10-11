import { cache } from 'react';
import { isGscConfigured } from '@/data/gsc/constants';
import { fallbackRate } from '@/data/telemetry/cron-stats';
import type { DateRange } from '@/data/telemetry/types';
import { readEsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { rangeFor, type RangeKey } from './period';
import { loadDeployMarkers } from './deploy-markers';
import {
  getCapabilityLatencyShared,
  getCapabilityOutcomeStatsShared,
  getCronOutcomesShared,
  getEsiRefreshQueueStatsShared,
  getLastCronRunsShared,
  getLastSyncedAtShared,
  getPriceRefreshDaysShared,
  getPriceSourceDegradationShared,
  getStaticsSummaryShared,
} from './shared-reads';
import { loadSection } from './load-section';
import { deriveSliSignals, type AdminSignals, type CronSignals, type SliReads } from './signals';

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

/**
 * The two capability reads every service level is derived from, for the
 * overview and the health page. Each is its own section, so one failed read
 * marks only the levels it feeds.
 */
export async function loadSliReads(range: DateRange): Promise<SliReads> {
  const [outcomes, latency] = await Promise.all([
    loadSection('capability-outcomes', () => getCapabilityOutcomeStatsShared(range)),
    loadSection('capability-latency', () => getCapabilityLatencyShared(range)),
  ]);
  return { outcomes, latency };
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
    loadSection('admin-signals.sli', async () => deriveSliSignals(await loadSliReads(range))),
    loadSection('admin-signals.queue', getEsiRefreshQueueStatsShared),
    loadSection('admin-signals.statics', getStaticsSummaryShared),
    loadSection('admin-signals.releases', loadDeployMarkers),
  ]);
  return { now: range.to, crons, budget, fallback, budgetExhaustions, sli, queue, statics, releases };
});
