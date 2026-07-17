import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { isGscConfigured } from '@/data/gsc/constants';
import {
  deriveCronStatus,
  deriveEsiSourceStatus,
  deriveGscStatus,
  PRICES_HEALTHY_OUTCOMES,
  refreshVolumeSummary,
  SDE_HEALTHY_OUTCOMES,
  SDE_NEUTRAL_OUTCOMES,
} from '@/data/telemetry/health-metrics';
import {
  getGscCronOutcomes,
  getLastCronRuns,
  getPriceCronOutcomes,
  getRefreshVolume,
  getSdeCronOutcomes,
} from '@/data/telemetry/queries';
import type { CronOutcomeCount, DateRange, UsageAction } from '@/data/telemetry/types';
import { AdminBarChart, AdminTrendChart } from './charts';
import {
  getBudgetExhaustionCountShared,
  getFallbackRateShared,
} from './esi-source-shared';
import { getLastSyncedAtShared } from './last-synced';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';
import { trendSeries } from './period';
import { SectionUnavailable } from './SectionUnavailable';
import { StatusRow } from './StatusRow';

type Trend = ReturnType<typeof trendSeries>;
type RefreshVolume = Awaited<ReturnType<typeof getRefreshVolume>>;

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
  return <div className="font-mono text-ui text-muted">{children}</div>;
}

function ChartBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-label tracking-display uppercase text-muted mb-2">{label}</div>
      {children}
    </div>
  );
}

function DurationTable({ rows }: { rows: CronOutcomeCount[] }) {
  if (rows.length === 0) return null;
  return (
    <ChartBlock label="Average duration by outcome">
      <table className="w-full font-mono text-ui">
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

function PriceCronDetail({
  refreshVolume,
  priceOutcomes,
  volumeTrend,
}: {
  refreshVolume: RefreshVolume;
  priceOutcomes: CronOutcomeCount[];
  volumeTrend: Trend;
}) {
  return (
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
  );
}

function SdeCronDetail({ sdeOutcomes }: { sdeOutcomes: CronOutcomeCount[] }) {
  return (
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
  );
}

function GscSyncDetail({
  gscConfigured,
  lastSyncedAt,
  gscOutcomes,
}: {
  gscConfigured: boolean;
  lastSyncedAt: Date | null;
  gscOutcomes: CronOutcomeCount[];
}) {
  return (
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
  );
}

/**
 * Renders the status strip surface; this component owns local presentation and interaction wiring
 * while callers own domain data.
 */
export async function StatusStrip({ range }: { range: DateRange }) {
  const gscConfigured = isGscConfigured();
  const fetched = await loadSection('system-health', () =>
    Promise.all([
      getLastCronRuns(),
      getPriceCronOutcomes(range),
      getSdeCronOutcomes(range),
      getGscCronOutcomes(range),
      getFallbackRateShared(range),
      getBudgetExhaustionCountShared(range),
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

  return (
    <Card>
      <SectionHeader
        size="md"
        label="System health"
        hint="status as of now · details follow the selected range"
      />

      <StatusRow name="Price cron" status={priceStatus}>
        <PriceCronDetail
          refreshVolume={refreshVolume}
          priceOutcomes={priceOutcomes}
          volumeTrend={volumeTrend}
        />
      </StatusRow>

      <StatusRow name="SDE cron" status={sdeStatus}>
        <SdeCronDetail sdeOutcomes={sdeOutcomes} />
      </StatusRow>

      <StatusRow name="GSC sync" status={gscStatus}>
        <GscSyncDetail
          gscConfigured={gscConfigured}
          lastSyncedAt={lastSyncedAt}
          gscOutcomes={gscOutcomes}
        />
      </StatusRow>

      <StatusRow name="ESI source" status={esiStatus} />
    </Card>
  );
}
