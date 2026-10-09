import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ReadoutList, ReadoutRow } from '@/components/ui/readout';
import { SectionHeader } from '@/components/ui/section-header';
import { trendSeries } from '@/composition/admin-period';
import { esiAvailability } from '@/data/telemetry/capability-stats';
import { fallbackRate } from '@/data/telemetry/cron-stats';
import { fallbackRatePoints } from '@/data/telemetry/health-metrics';
import {
  getHistorySourceSplit,
  getPriceSourceSplit,
  getTopCostlyEndpoints,
  getWriteBehindOutcomes,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { readEsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { AdminBarChart, AdminTrendChart } from '../charts';
import { CardLink } from '../CardLink';
import {
  getCapabilityOutcomeStatsShared,
  getEsiRefreshQueueStatsShared,
  getPriceRefreshDaysShared,
  getPriceSourceDegradationShared,
} from '../shared-reads';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { LevelRows } from '../LevelRows';
import { deriveCostLensView, type OpsMetricRow } from '../ops-view';
import { SectionUnavailable } from '../SectionUnavailable';
import { deriveBudgetCard, derivePressureLines } from './esi-view';

// Plain figures carry no verdict: no dot, and every value in the default colour.
function MetricList({ rows }: { rows: OpsMetricRow[] }) {
  return (
    <ReadoutList>
      {rows.map((row) => (
        <ReadoutRow key={row.label} label={row.label} value={row.value} note={row.note} />
      ))}
    </ReadoutList>
  );
}

export async function BudgetCard() {
  const fetched = await loadSection('esi-budget', readEsiBudgetSnapshot);
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Error budget" />;
  const budget = deriveBudgetCard(fetched);
  return (
    <Card data-admin-budget className="h-full">
      <SectionHeader size="md" label="Error budget" />
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
    </Card>
  );
}

export async function PressureCard({ range }: { range: DateRange }) {
  const fetched = await loadSection('esi-pressure', () =>
    Promise.all([
      getCapabilityOutcomeStatsShared(range),
      getPriceRefreshDaysShared(range).then(fallbackRate),
      getPriceSourceDegradationShared(range),
      getEsiRefreshQueueStatsShared(),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Rate-limit pressure" />;
  const [outcomes, fallback, { byCaller: degradation, budgetExhaustions }, queue] = fetched;
  const esiSuccess = esiAvailability(outcomes);
  return (
    <Card data-admin-pressure className="h-full">
      <SectionHeader
        size="md"
        label="Rate-limit pressure"
        hint={<CardLink href="/admin/queue">Queue</CardLink>}
      />
      <LevelRows lines={derivePressureLines({ esiSuccess: esiSuccess.rate, esiSamples: esiSuccess.total, budgetExhaustions, fallback, degradation, queue })} />
    </Card>
  );
}

export async function PriceSourceCard({ range }: { range: DateRange }) {
  const fetched = await loadSection('price-source', () =>
    Promise.all([getPriceRefreshDaysShared(range).then(fallbackRate), getPriceSourceDegradationShared(range)]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Price-source health" />;
  const [fallback, { byCaller: degradation }] = fetched;
  const fallbackTrend = trendSeries(
    fallback.perDay.map((point) => point.day),
    fallbackRatePoints(fallback.perDay),
  );
  return (
    <Card>
      <SectionHeader size="md" label="Scheduled price sources" />
      <div className="grid grid-cols-1 divide-y divide-border-soft md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="px-3.5 py-3">
          <SectionHeader variant="sub" label="Scheduled Fuzzwork share by day" className="mb-2" />
          {fallback.perDay.length === 0 ? (
            <EmptyState>No price refreshes in this range.</EmptyState>
          ) : (
            <AdminTrendChart
              points={fallbackTrend.points}
              labels={fallbackTrend.labels}
              unit="percent"
              ariaLabel="Fallback rate by day"
            />
          )}
        </div>
        <div className="px-3.5 py-3">
          <SectionHeader variant="sub" label="Fallback refreshes by caller" className="mb-2" />
          {degradation.length === 0 ? (
            <EmptyState>No degraded price reads in this range.</EmptyState>
          ) : (
            <AdminBarChart
              data={degradation.map((row) => ({ label: row.caller, value: row.count }))}
              ariaLabel="Degradation events by caller"
            />
          )}
        </div>
      </div>
    </Card>
  );
}

async function loadCost(range: DateRange) {
  return loadSection('esi-cost', async () => {
    const [prices, history, writeBehind, endpoints, fallback, { byCaller: degradation, budgetExhaustions }] =
      await Promise.all([
        getPriceSourceSplit(range),
        getHistorySourceSplit(range),
        getWriteBehindOutcomes(range),
        getTopCostlyEndpoints(range, 8),
        getPriceRefreshDaysShared(range).then(fallbackRate),
        getPriceSourceDegradationShared(range),
      ]);
    return deriveCostLensView({
      prices,
      history,
      writeBehind,
      endpoints,
      fallback,
      budgetExhaustions,
      degradationByCaller: degradation,
    });
  });
}

export async function CostCards({ range }: { range: DateRange }) {
  const view = await loadCost(range);
  if (view === SECTION_LOAD_FAILED) return <SectionUnavailable label="ESI cost" />;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="h-full">
        <SectionHeader size="md" label="On-demand prices & history" />
        <MetricList rows={view.metrics} />
      </Card>
      <Card className="h-full">
        <SectionHeader size="md" label="Busiest owned-data endpoints" />
        {view.endpoints.length === 0 ? (
          <EmptyState>No owned-data reads in this range.</EmptyState>
        ) : (
          <DistributionBars rows={view.endpoints} ariaLabel="Owned-data endpoint requests" />
        )}
      </Card>
    </div>
  );
}
