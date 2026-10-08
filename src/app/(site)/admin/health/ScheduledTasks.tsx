import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { DistributionBars } from '@/components/ui/distribution-bars';
import type { ShareSegment } from '@/components/ui/stacked-share-bar';
import { isGscConfigured } from '@/data/gsc/constants';
import { refreshVolumeSummary } from '@/data/telemetry/health-metrics';
import {
  getGscCronOutcomes,
  getHousekeepingCronOutcomes,
  getLastCronRuns,
  getPriceCronOutcomes,
  getRefreshVolume,
  getSdeCronOutcomes,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { trendSeries } from '@/composition/admin-period';
import { AdminTrendChart } from '../charts';
import { getLastSyncedAtShared } from '../shared-reads';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { SectionUnavailable } from '../SectionUnavailable';
import { CRON_OUTCOME_RULES, deriveCronStatuses } from '../signals';
import { formatDurationMs, toneOutcomes, type TonedOutcome } from './cron-outcomes';
import { ChartBlock, DetailBody, DetailCaption } from './DetailBlocks';
import { StatusRow } from './StatusRow';

type Trend = ReturnType<typeof trendSeries>;
type RefreshVolume = Awaited<ReturnType<typeof getRefreshVolume>>;

function OutcomeBars({ outcomes, ariaLabel }: { outcomes: TonedOutcome[]; ariaLabel: string }) {
  return (
    <div className="-mx-3.5">
      <DistributionBars
        rows={outcomes.map((o) => ({
          key: o.outcome,
          label: o.outcome,
          count: o.count,
          tone: o.tone,
          detail: `avg ${formatDurationMs(o.avgDurationMs)}`,
        }))}
        sort="none"
        fill="share"
        ariaLabel={ariaLabel}
      />
    </div>
  );
}

function shareOf(outcomes: TonedOutcome[]): ShareSegment[] | undefined {
  if (outcomes.length === 0) return undefined;
  return outcomes.map((o) => ({ label: o.outcome, value: o.count, tone: o.tone }));
}

function PriceCronDetail({
  refreshVolume,
  priceOutcomes,
  volumeTrend,
}: {
  refreshVolume: RefreshVolume;
  priceOutcomes: TonedOutcome[];
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
          <OutcomeBars outcomes={priceOutcomes} ariaLabel="Price-cron runs by outcome" />
        </ChartBlock>
      )}
    </DetailBody>
  );
}

function CronOutcomeDetail({
  outcomes,
  ariaLabel,
}: {
  outcomes: TonedOutcome[];
  ariaLabel: string;
}) {
  return (
    <DetailBody>
      {outcomes.length === 0 ? (
        <DetailCaption>
          No runs in this period.
        </DetailCaption>
      ) : (
        <ChartBlock label="Runs by outcome">
          <OutcomeBars outcomes={outcomes} ariaLabel={ariaLabel} />
        </ChartBlock>
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
  gscOutcomes: TonedOutcome[];
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
              <OutcomeBars outcomes={gscOutcomes} ariaLabel="GSC sync runs by outcome" />
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
      getHousekeepingCronOutcomes(range),
      getRefreshVolume(range),
      gscConfigured ? getLastSyncedAtShared() : Promise.resolve(null),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Scheduled tasks" />;

  const [lastRuns, priceOutcomes, sdeOutcomes, gscOutcomes, housekeepingOutcomes, refreshVolume, lastSyncedAt] =
    fetched;
  const statuses = deriveCronStatuses(
    {
      lastRuns,
      priceOutcomes,
      sdeOutcomes,
      gscOutcomes,
      housekeepingOutcomes,
      gscConfigured,
      gscLastSyncedAt: lastSyncedAt,
    },
    range.to,
  );
  const toned = {
    price: toneOutcomes(priceOutcomes, CRON_OUTCOME_RULES.price),
    sde: toneOutcomes(sdeOutcomes, CRON_OUTCOME_RULES.sde),
    gsc: toneOutcomes(gscOutcomes, CRON_OUTCOME_RULES.gsc),
    housekeeping: toneOutcomes(housekeepingOutcomes, CRON_OUTCOME_RULES.housekeeping),
  };
  const volumeTrend = trendSeries(
    refreshVolume.map((p) => p.day),
    refreshVolume.map((p) => p.fetched),
  );

  return (
    <Card id="scheduled" className="scroll-mt-24">
      <SectionHeader size="md" label="Scheduled tasks" />

      <StatusRow name="Price cron" status={statuses.price} share={shareOf(toned.price)}>
        <PriceCronDetail
          refreshVolume={refreshVolume}
          priceOutcomes={toned.price}
          volumeTrend={volumeTrend}
        />
      </StatusRow>

      <StatusRow name="SDE cron" status={statuses.sde} share={shareOf(toned.sde)}>
        <CronOutcomeDetail outcomes={toned.sde} ariaLabel="SDE-cron runs by outcome" />
      </StatusRow>

      <StatusRow name="GSC sync" status={statuses.gsc} share={shareOf(toned.gsc)}>
        <GscSyncDetail
          gscConfigured={gscConfigured}
          lastSyncedAt={lastSyncedAt}
          gscOutcomes={toned.gsc}
        />
      </StatusRow>

      <StatusRow
        name="Housekeeping"
        status={statuses.housekeeping}
        share={shareOf(toned.housekeeping)}
      >
        <CronOutcomeDetail outcomes={toned.housekeeping} ariaLabel="Housekeeping runs by outcome" />
      </StatusRow>
    </Card>
  );
}
