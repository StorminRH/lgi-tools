import { Suspense, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { SectionHeader } from '@/components/ui/section-header';
import {
  getEsiRefreshQueueStats,
  listDeadLetteredJobs,
} from '@/data/esi-refresh-jobs/queries';
import {
  getHistorySourceSplit,
  getPriceSourceSplit,
  getTopCostlyEndpoints,
  getWriteBehindOutcomes,
} from '@/data/telemetry/cost-queries';
import {
  budgetSummary,
  degradationCallerSummary,
  fallbackRatePoints,
  fallbackSummary,
} from '@/data/telemetry/health-metrics';
import { getDegradationByCaller } from '@/data/telemetry/queries';
import type {
  DateRange,
  DegradationCallerCount,
  FallbackRateData,
} from '@/data/telemetry/types';
import { listRecentDomainEvents } from '@/data/domain-events/queries';
import { readEsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { AdminBarChart, AdminTrendChart } from './charts';
import {
  getBudgetExhaustionCountShared,
  getFallbackRateShared,
} from './esi-source-shared';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import {
  deriveBudgetView,
  deriveCostLensView,
  deriveDeadLetterView,
  deriveQueueView,
  summarizeDomainEvent,
  type OpsMetricRow,
} from './ops-view';
import { trendSeries, type RangeKey } from './period';
import { RetryJobForm } from './RetryJobForm';
import { SectionUnavailable } from './SectionUnavailable';

function OpsCardFallback({ label }: { label: string }) {
  return (
    <Card>
      <SectionHeader size="md" label={label} hint="loading" />
      <LoadingLabel className="block px-3.5 py-6" />
    </Card>
  );
}

function MetricsTable({ rows }: { rows: OpsMetricRow[] }) {
  return (
    <table className="w-full font-mono text-ui tabular-nums">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-border-soft first:border-t-0">
            <th scope="row" className="px-3.5 py-2 text-left font-normal text-text">
              {row.label}
            </th>
            <td className="px-3.5 py-2 text-right text-name">{row.value}</td>
            <td className="px-3.5 py-2 text-right text-micro text-muted hidden md:table-cell">
              {row.note}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-border-soft px-3.5 py-3">
      <div className="mb-2 text-label tracking-display uppercase text-muted">{label}</div>
      {children}
    </div>
  );
}

async function BudgetPanel() {
  const fetched = await loadSection('esi-budget', readEsiBudgetSnapshot);
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="ESI error budget" />;
  const view = deriveBudgetView(fetched);
  return (
    <Card>
      <SectionHeader size="md" label="ESI error budget" hint="live gate state" />
      <div className={view.level === 'red' ? 'px-3.5 py-2 text-ui text-tone-red' : 'px-3.5 py-2 text-ui text-isk'}>
        {view.headline}
      </div>
      {view.metrics.length > 0 && <MetricsTable rows={view.metrics} />}
    </Card>
  );
}

async function QueuePanel({ rangeKey }: { rangeKey: RangeKey }) {
  const fetched = await loadSection('esi-refresh-queue', () =>
    Promise.all([getEsiRefreshQueueStats(), listDeadLetteredJobs(20)]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Deferred refresh queue" />;
  const [stats, deadLetters] = fetched;
  const queue = deriveQueueView(stats, new Date());
  const dead = deriveDeadLetterView(deadLetters);
  return (
    <Card>
      <SectionHeader
        size="md"
        label="Deferred refresh queue"
        hint={`${queue.activeDepth.toLocaleString()} active`}
      />
      {queue.empty ? (
        <EmptyState>No queued or retained refresh jobs.</EmptyState>
      ) : (
        <table className="w-full font-mono text-ui tabular-nums">
          <thead>
            <tr className="border-b border-border-soft text-label tracking-display uppercase text-muted">
              <th scope="col" className="px-3.5 py-2 text-left font-medium">Status</th>
              <th scope="col" className="px-3.5 py-2 text-right font-medium">Count</th>
              <th scope="col" className="px-3.5 py-2 text-right font-medium">Oldest</th>
            </tr>
          </thead>
          <tbody>
            {queue.rows.map((row) => (
              <tr key={row.status} className="border-b border-border-soft last:border-b-0">
                <th scope="row" className="px-3.5 py-2 text-left font-normal text-text">{row.label}</th>
                <td className="px-3.5 py-2 text-right text-name">{row.count.toLocaleString()}</td>
                <td className="px-3.5 py-2 text-right text-muted">{row.oldestAge}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <DetailBlock label={`Dead letters · ${dead.length}`}>
        {dead.length === 0 ? (
          <div className="font-mono text-ui text-muted">No dead-lettered refresh jobs.</div>
        ) : (
          <ul className="-mx-3.5 -mb-3">
            {dead.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 border-t border-border-soft px-3.5 py-3 first:border-t-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-ui text-text">{row.title}</div>
                  <div className="font-mono text-micro text-muted break-all">
                    {row.failureClass} · {row.endpointClass} · {row.attempts} attempts · {row.timing}
                  </div>
                </div>
                <RetryJobForm jobId={row.id} range={rangeKey} />
              </li>
            ))}
          </ul>
        )}
      </DetailBlock>
    </Card>
  );
}

async function CostPanel({ range }: { range: DateRange }) {
  const fetched = await loadSection('esi-cost-lens', () =>
    Promise.all([
      getPriceSourceSplit(range),
      getHistorySourceSplit(range),
      getWriteBehindOutcomes(range),
      getTopCostlyEndpoints(range, 8),
      getFallbackRateShared(range),
      getBudgetExhaustionCountShared(range),
      getDegradationByCaller(range),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="ESI cost lens" />;
  const [prices, history, writeBehind, endpoints, fallback, budgetExhaustions, degradation] = fetched;
  const view = deriveCostLensView({
    prices,
    history,
    writeBehind,
    endpoints,
    fallback,
    budgetExhaustions,
    degradationByCaller: degradation,
  });
  return (
    <Card>
      <SectionHeader size="md" label="ESI cost lens" hint="selected range" />
      <MetricsTable rows={view.metrics} />
      <PriceSourceHealth
        fallback={fallback}
        budgetExhaustions={budgetExhaustions}
        degradation={degradation}
      />
      <EndpointUsage endpoints={view.endpoints} />
    </Card>
  );
}

function PriceSourceHealth({
  fallback,
  budgetExhaustions,
  degradation,
}: {
  fallback: FallbackRateData;
  budgetExhaustions: number;
  degradation: DegradationCallerCount[];
}) {
  const fallbackTrend = trendSeries(
    fallback.perDay.map((point) => point.day),
    fallbackRatePoints(fallback.perDay),
  );
  return (
    <DetailBlock label="Price-source health">
      <div className="flex flex-col gap-2 font-mono text-ui text-muted">
        <div>{fallbackSummary(fallback)}</div>
        <div>{budgetSummary(budgetExhaustions)}</div>
        <div>{degradationCallerSummary(degradation)}</div>
      </div>
      {fallback.perDay.length > 0 && (
        <div className="mt-3">
          <AdminTrendChart
            points={fallbackTrend.points}
            labels={fallbackTrend.labels}
            unit="percent"
            ariaLabel="Fallback rate by day"
          />
        </div>
      )}
      {degradation.length > 0 && (
        <div className="mt-3">
          <AdminBarChart
            data={degradation.map((row) => ({ label: row.caller, value: row.count }))}
            ariaLabel="Degradation events by caller"
          />
        </div>
      )}
    </DetailBlock>
  );
}

function EndpointUsage({
  endpoints,
}: {
  endpoints: ReturnType<typeof deriveCostLensView>['endpoints'];
}) {
  return (
    <DetailBlock label="Most-used owned-data endpoints">
      {endpoints.length === 0 ? (
        <div className="font-mono text-ui text-muted">No owned-data reads in this range.</div>
      ) : (
        <DistributionBars rows={endpoints} ariaLabel="Owned-data endpoint requests" />
      )}
    </DetailBlock>
  );
}

async function EventPanel() {
  const fetched = await loadSection('recent-domain-events', () => listRecentDomainEvents(30));
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Recent rail events" />;
  return (
    <Card>
      <SectionHeader size="md" label="Recent rail events" hint="latest 30" />
      {fetched.length === 0 ? (
        <EmptyState>No operational events recorded yet.</EmptyState>
      ) : (
        <ol>
          {fetched.map((event) => (
            <li key={event.id} className="border-b border-border-soft px-3.5 py-2 last:border-b-0">
              <div className="font-mono text-ui text-text">{summarizeDomainEvent(event)}</div>
              <div className="font-mono text-micro text-muted">
                {event.occurredAt.toISOString().replace('T', ' ').slice(0, 19)} UTC
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/**
 * Composes four independently suspended operations panels so one unavailable data source cannot
 * blank the full section.
 */
export function OpsSection({ rangeKey, range }: { rangeKey: RangeKey; range: DateRange }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Suspense fallback={<OpsCardFallback label="ESI error budget" />}>
        <BudgetPanel />
      </Suspense>
      <Suspense fallback={<OpsCardFallback label="Deferred refresh queue" />}>
        <QueuePanel rangeKey={rangeKey} />
      </Suspense>
      <Suspense fallback={<OpsCardFallback label="ESI cost lens" />}>
        <CostPanel range={range} />
      </Suspense>
      <Suspense fallback={<OpsCardFallback label="Recent rail events" />}>
        <EventPanel />
      </Suspense>
    </div>
  );
}
