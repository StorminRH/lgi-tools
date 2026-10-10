import { cn } from '@/components/ui/cn';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ReadoutList, ReadoutRow } from '@/components/ui/readout';
import { trendSeries } from '@/composition/admin-period';
import { esiAvailability, esiClientErrors } from '@/data/telemetry/capability-stats';
import { fallbackRate } from '@/data/telemetry/cron-stats';
import { fallbackRatePoints } from '@/data/telemetry/health-metrics';
import {
  getHistorySourceSplit,
  getPriceSourceSplit,
  getTopCostlyEndpoints,
  getWriteBehindOutcomes,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { formatQuantity } from '@/lib/format/number';
import { readEsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { AdminBarChart, AdminTrendChart } from '../charts';
import {
  getCapabilityOutcomeStatsShared,
  getEsiClientErrorsShared,
  getEsiRefreshQueueStatsShared,
  getPriceRefreshDaysShared,
  getPriceSourceDegradationShared,
} from '../shared-reads';
import { deriveEndpointBars, deriveOnDemandMetrics, type OpsMetricRow } from '../ops-view';
import { TitledBlock } from '../TitledBlock';
import { deriveBudgetCard, derivePressureLines } from './esi-view';

const BUSIEST_ENDPOINTS = 8;

// Plain figures carry no verdict: no dot, and every value in the default colour.
export function MetricList({ rows }: { rows: OpsMetricRow[] }) {
  return (
    <ReadoutList>
      {rows.map((row) => (
        <ReadoutRow key={row.label} label={row.label} value={row.value} note={row.note} />
      ))}
    </ReadoutList>
  );
}

export async function loadBudget() {
  return deriveBudgetCard(await readEsiBudgetSnapshot());
}

export function BudgetGauge({ budget }: { budget: Awaited<ReturnType<typeof loadBudget>> }) {
  return (
    <>
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <div className="flex items-baseline gap-2">
          <span className={cn('font-data text-stat tabular-nums', budget.level === 'red' ? 'text-tone-red' : 'text-name')}>
            {budget.remaining}
          </span>
          <span className="font-ui text-ui text-muted">of {budget.ceiling} estimated errors remaining</span>
        </div>
        <ProgressBar pct={budget.pct} />
        <span className="font-ui text-label text-muted">{budget.note}</span>
      </div>
      {budget.figures.length > 0 && (
        <div className="border-t border-border-soft">
          <MetricList rows={budget.figures} />
        </div>
      )}
    </>
  );
}

export async function loadPressureLines(range: DateRange) {
  const [outcomes, fallback, degradation, queue, clientErrors] = await Promise.all([
    getCapabilityOutcomeStatsShared(range),
    getPriceRefreshDaysShared(range).then(fallbackRate),
    getPriceSourceDegradationShared(range),
    getEsiRefreshQueueStatsShared(),
    getEsiClientErrorsShared(range).then(esiClientErrors),
  ]);
  const esiSuccess = esiAvailability(outcomes);
  return derivePressureLines({
    esiSuccess: esiSuccess.rate,
    esiSamples: esiSuccess.total,
    budgetExhaustions: degradation.budgetExhaustions,
    fallback,
    degradation: degradation.byCaller,
    queue,
    clientErrors,
  });
}

export async function loadPriceSources(range: DateRange) {
  const [days, degradation] = await Promise.all([getPriceRefreshDaysShared(range), getPriceSourceDegradationShared(range)]);
  const perDay = fallbackRate(days).perDay;
  return {
    hasRefreshes: perDay.length > 0,
    fallbackTrend: trendSeries(perDay.map((point) => point.day), fallbackRatePoints(perDay)),
    byCaller: degradation.byCaller.map((row) => ({ label: row.caller, value: row.count })),
  };
}

export function PriceSourceCharts({ sources }: { sources: Awaited<ReturnType<typeof loadPriceSources>> }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-border-soft md:grid-cols-2 md:divide-x md:divide-y-0">
      <TitledBlock title="Scheduled Fuzzwork share by day" padded>
        {sources.hasRefreshes ? (
          <AdminTrendChart
            points={sources.fallbackTrend.points}
            labels={sources.fallbackTrend.labels}
            unit="percent"
            ariaLabel="Fallback rate by day"
          />
        ) : (
          <EmptyState inset>No price refreshes in this range.</EmptyState>
        )}
      </TitledBlock>
      <TitledBlock title="Fallback refreshes by caller" padded>
        {sources.byCaller.length === 0 ? (
          <EmptyState inset kind="clear">No degraded price reads in this range.</EmptyState>
        ) : (
          <AdminBarChart data={sources.byCaller} ariaLabel="Degradation events by caller" />
        )}
      </TitledBlock>
    </div>
  );
}

export async function loadOnDemandMetrics(range: DateRange) {
  const [prices, history, writeBehind, degradation] = await Promise.all([
    getPriceSourceSplit(range),
    getHistorySourceSplit(range),
    getWriteBehindOutcomes(range),
    getPriceSourceDegradationShared(range),
  ]);
  return deriveOnDemandMetrics({ prices, history, writeBehind, budgetExhaustions: degradation.budgetExhaustions });
}

export async function loadBusiestEndpoints(range: DateRange) {
  return deriveEndpointBars(await getTopCostlyEndpoints(range, BUSIEST_ENDPOINTS));
}

export function EndpointBars({ rows }: { rows: Awaited<ReturnType<typeof loadBusiestEndpoints>> }) {
  if (rows.length === 0) return <EmptyState>No owned-data reads in this range.</EmptyState>;
  return <DistributionBars rows={rows} formatCount={formatQuantity} ariaLabel="Owned-data endpoint requests" />;
}
