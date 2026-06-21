import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { isGscConfigured } from '@/data/gsc/constants';
import {
  budgetSummary,
  degradationCallerSummary,
  deriveCronStatus,
  deriveEsiSourceStatus,
  deriveGscStatus,
  fallbackSummary,
  PRICES_HEALTHY_OUTCOMES,
  refreshVolumeSummary,
  SDE_HEALTHY_OUTCOMES,
  SDE_NEUTRAL_OUTCOMES,
} from '@/data/telemetry/health-metrics';
import {
  getBudgetExhaustionCount,
  getDegradationByCaller,
  getFallbackRate,
  getGscCronOutcomes,
  getLastCronRuns,
  getPriceCronOutcomes,
  getRefreshVolume,
  getSdeCronOutcomes,
} from '@/data/telemetry/queries';
import type { CronOutcomeCount, DateRange, UsageAction } from '@/data/telemetry/types';
import { AdminBarChart, AdminTrendChart } from './charts';
import { getLastSyncedAtShared } from './last-synced';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { trendSeries } from './period';
import { SectionUnavailable } from './SectionUnavailable';
import { StatusRow } from './StatusRow';

// The is-anything-broken strip: one row per subsystem, reduced to a colored
// dot + one-line readout. Status is anchored on "now" (latest run, current
// staleness); the charts inside each row's collapsed details follow the
// dashboard's selected range.

function DetailBody({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-border-soft px-3.5 py-3 flex flex-col gap-4">{children}</div>
  );
}

function DetailCaption({ children }: { children: ReactNode }) {
  return <div className="font-mono text-[11px] text-muted">{children}</div>;
}

function ChartBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.16em] uppercase text-muted mb-2">{label}</div>
      {children}
    </div>
  );
}

function DurationTable({ rows }: { rows: CronOutcomeCount[] }) {
  if (rows.length === 0) return null;
  return (
    <ChartBlock label="Average duration by outcome">
      <table className="w-full font-mono text-[12px]">
        <tbody>
          {rows.map((o) => (
            <tr key={o.outcome} className="border-t border-border-soft">
              <td className="py-1 text-text">{o.outcome}</td>
              <td className="py-1 text-right text-muted tabular-nums">
                {o.avgDurationMs.toLocaleString()} ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartBlock>
  );
}

export async function StatusStrip({ range }: { range: DateRange }) {
  const gscConfigured = isGscConfigured();
  const fetched = await loadSection('system-health', () =>
    Promise.all([
      getLastCronRuns(),
      getPriceCronOutcomes(range),
      getSdeCronOutcomes(range),
      getGscCronOutcomes(range),
      getFallbackRate(range),
      getBudgetExhaustionCount(range),
      getDegradationByCaller(range),
      getRefreshVolume(range),
      gscConfigured ? getLastSyncedAtShared() : Promise.resolve(null),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="System health" />;

  const [
    lastRuns,
    priceOutcomes,
    sdeOutcomes,
    gscOutcomes,
    fallback,
    budgetExhaustions,
    degradationByCaller,
    refreshVolume,
    lastSyncedAt,
  ] = fetched;

  const now = new Date();
  const lastFor = (action: UsageAction) => lastRuns.find((r) => r.action === action) ?? null;

  const priceStatus = deriveCronStatus({
    lastRun: lastFor('cron_prices'),
    outcomes: priceOutcomes,
    healthy: PRICES_HEALTHY_OUTCOMES,
    expectedEveryHours: 24,
    now,
  });
  const sdeStatus = deriveCronStatus({
    lastRun: lastFor('cron_sde'),
    outcomes: sdeOutcomes,
    healthy: SDE_HEALTHY_OUTCOMES,
    neutral: SDE_NEUTRAL_OUTCOMES,
    expectedEveryHours: 24,
    now,
  });
  const gscStatus = deriveGscStatus({
    configured: gscConfigured,
    lastRun: lastFor('cron_gsc'),
    outcomes: gscOutcomes,
    lastSyncedAt,
    now,
  });
  const esiStatus = deriveEsiSourceStatus({ fallback, budgetExhaustions });

  const volumeTrend = trendSeries(
    refreshVolume.map((p) => p.day),
    refreshVolume.map((p) => p.fetched),
  );
  const fallbackTrend = trendSeries(
    fallback.perDay.map((p) => p.day),
    fallback.perDay.map((p) =>
      p.esi + p.fallback === 0 ? 0 : Math.round((p.fallback / (p.esi + p.fallback)) * 100),
    ),
  );

  return (
    <Card>
      <SectionHeader
        size="md"
        label="System health"
        hint="status as of now · details follow the selected range"
      />

      <StatusRow name="Price cron" status={priceStatus}>
        <DetailBody>
          <DetailCaption>{refreshVolumeSummary(refreshVolume)}</DetailCaption>
          {refreshVolume.length > 0 && (
            <ChartBlock label="Rows fetched by day">
              <AdminTrendChart
                points={volumeTrend.points}
                labels={volumeTrend.labels}
                unit="count"
                ariaLabel="Rows fetched by day"
              />
            </ChartBlock>
          )}
          {priceOutcomes.length > 0 && (
            <ChartBlock label="Runs by outcome">
              <AdminBarChart
                data={priceOutcomes.map((o) => ({ label: o.outcome, value: o.count }))}
                ariaLabel="Price-cron runs by outcome"
              />
            </ChartBlock>
          )}
          <DurationTable rows={priceOutcomes} />
        </DetailBody>
      </StatusRow>

      <StatusRow name="SDE cron" status={sdeStatus}>
        <DetailBody>
          {sdeOutcomes.length === 0 ? (
            <DetailCaption>
              No SDE cron runs in this range (it runs daily — pick a wider range to see history).
            </DetailCaption>
          ) : (
            <>
              <ChartBlock label="Runs by outcome">
                <AdminBarChart
                  data={sdeOutcomes.map((o) => ({ label: o.outcome, value: o.count }))}
                  ariaLabel="SDE-cron runs by outcome"
                />
              </ChartBlock>
              <DurationTable rows={sdeOutcomes} />
            </>
          )}
        </DetailBody>
      </StatusRow>

      <StatusRow name="GSC sync" status={gscStatus}>
        <DetailBody>
          {!gscConfigured ? (
            <DetailCaption>
              Set GSC_SERVICE_ACCOUNT_JSON and GSC_SITE_URL to sync Search Console data.
            </DetailCaption>
          ) : (
            <>
              <DetailCaption>
                Google data lags ~2–3 days · last synced{' '}
                {lastSyncedAt
                  ? `${lastSyncedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`
                  : 'never'}
              </DetailCaption>
              {gscOutcomes.length > 0 && (
                <ChartBlock label="Sync runs by outcome">
                  <AdminBarChart
                    data={gscOutcomes.map((o) => ({ label: o.outcome, value: o.count }))}
                    ariaLabel="GSC sync runs by outcome"
                  />
                </ChartBlock>
              )}
            </>
          )}
        </DetailBody>
      </StatusRow>

      <StatusRow name="ESI source" status={esiStatus}>
        <DetailBody>
          <DetailCaption>{fallbackSummary(fallback)}</DetailCaption>
          <DetailCaption>{budgetSummary(budgetExhaustions)}</DetailCaption>
          {fallback.perDay.length > 0 && (
            <ChartBlock label="Fallback rate by day">
              <AdminTrendChart
                points={fallbackTrend.points}
                labels={fallbackTrend.labels}
                unit="percent"
                ariaLabel="Fallback rate by day"
              />
            </ChartBlock>
          )}
          <DetailCaption>{degradationCallerSummary(degradationByCaller)}</DetailCaption>
          {degradationByCaller.length > 0 && (
            <ChartBlock label="Degradation events by caller">
              <AdminBarChart
                data={degradationByCaller.map((d) => ({ label: d.caller, value: d.count }))}
                ariaLabel="Degradation events by caller"
              />
            </ChartBlock>
          )}
        </DetailBody>
      </StatusRow>
    </Card>
  );
}
