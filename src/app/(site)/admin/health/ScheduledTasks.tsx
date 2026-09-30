import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { isGscConfigured } from '@/data/gsc/constants';
import { refreshVolumeSummary } from '@/data/telemetry/health-metrics';
import {
  getGscCronOutcomes,
  getLastCronRuns,
  getPriceCronOutcomes,
  getRefreshVolume,
  getSdeCronOutcomes,
} from '@/data/telemetry/queries';
import type { CronOutcomeCount, DateRange } from '@/data/telemetry/types';
import { trendSeries } from '@/composition/admin-period';
import { AdminBarChart, AdminTrendChart } from '../charts';
import { getLastSyncedAtShared } from '../last-synced';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { SectionUnavailable } from '../SectionUnavailable';
import { deriveCronStatuses } from '../signals';
import { StatusRow } from './StatusRow';

type Trend = ReturnType<typeof trendSeries>;
type RefreshVolume = Awaited<ReturnType<typeof getRefreshVolume>>;

function DetailBody({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-border-soft px-3.5 py-3 flex flex-col gap-4">{children}</div>
  );
}

function DetailCaption({ children }: { children: ReactNode }) {
  return <div className="font-data text-ui text-muted">{children}</div>;
}

function ChartBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <SectionHeader variant="sub" label={label} className="mb-2" />
      {children}
    </div>
  );
}

function DurationTable({ rows }: { rows: CronOutcomeCount[] }) {
  if (rows.length === 0) return null;
  const columns = [
    { key: 'outcome', label: 'Outcome', render: (row) => row.outcome, className: 'text-text' },
    {
      key: 'duration',
      label: 'Average duration',
      align: 'right',
      render: (row) => `${row.avgDurationMs.toLocaleString()} ms`,
      className: 'text-muted tabular-nums',
    },
  ] satisfies readonly StaticTableColumn<CronOutcomeCount>[];
  return (
    <ChartBlock label="Average duration by outcome">
      <StaticTable
        ariaLabel="Average duration by outcome"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.outcome}
      />
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
          No runs in this period.
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
          Search Console not connected.
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

export async function ScheduledTasks({ range }: { range: DateRange }) {
  const gscConfigured = isGscConfigured();
  const fetched = await loadSection('scheduled-tasks', () =>
    Promise.all([
      getLastCronRuns(),
      getPriceCronOutcomes(range),
      getSdeCronOutcomes(range),
      getGscCronOutcomes(range),
      getRefreshVolume(range),
      gscConfigured ? getLastSyncedAtShared() : Promise.resolve(null),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Scheduled tasks" />;

  const [lastRuns, priceOutcomes, sdeOutcomes, gscOutcomes, refreshVolume, lastSyncedAt] = fetched;
  const statuses = deriveCronStatuses(
    { lastRuns, priceOutcomes, sdeOutcomes, gscOutcomes, gscConfigured, gscLastSyncedAt: lastSyncedAt },
    range.to,
  );
  const volumeTrend = trendSeries(
    refreshVolume.map((p) => p.day),
    refreshVolume.map((p) => p.fetched),
  );

  return (
    <Card id="scheduled" className="scroll-mt-24">
      <SectionHeader size="md" label="Scheduled tasks" />

      <StatusRow name="Price cron" status={statuses.price}>
        <PriceCronDetail
          refreshVolume={refreshVolume}
          priceOutcomes={priceOutcomes}
          volumeTrend={volumeTrend}
        />
      </StatusRow>

      <StatusRow name="SDE cron" status={statuses.sde}>
        <SdeCronDetail sdeOutcomes={sdeOutcomes} />
      </StatusRow>

      <StatusRow name="GSC sync" status={statuses.gsc}>
        <GscSyncDetail
          gscConfigured={gscConfigured}
          lastSyncedAt={lastSyncedAt}
          gscOutcomes={gscOutcomes}
        />
      </StatusRow>
    </Card>
  );
}
