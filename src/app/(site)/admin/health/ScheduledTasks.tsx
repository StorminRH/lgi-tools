import { DistributionBars } from '@/components/ui/distribution-bars';
import { EmptyState } from '@/components/ui/empty-state';
import type { ShareSegment } from '@/components/ui/stacked-share-bar';
import { refreshVolume as refreshVolumeOf } from '@/data/telemetry/cron-stats';
import { refreshVolumeSummary } from '@/data/telemetry/health-metrics';
import type { DateRange, RefreshVolumePoint } from '@/data/telemetry/types';
import { trendSeries } from '@/composition/admin-period';
import { AdminTrendChart } from '../charts';
import { loadCronSignals } from '../load-signals';
import { getPriceRefreshDaysShared } from '../shared-reads';
import { CRON_OUTCOME_RULES, deriveCronStatuses } from '../signals';
import { TitledBlock } from '../TitledBlock';
import { formatDurationMs, toneOutcomes, type TonedOutcome } from './cron-outcomes';
import { DetailBody, DetailCaption } from './DetailBlocks';
import { StatusRow } from './StatusRow';

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
}: {
  refreshVolume: RefreshVolumePoint[];
  priceOutcomes: TonedOutcome[];
}) {
  const volumeTrend = trendSeries(
    refreshVolume.map((p) => p.day),
    refreshVolume.map((p) => p.fetched),
  );
  return (
    <DetailBody>
      {refreshVolume.length === 0 ? (
        <EmptyState inset>No price refreshes recorded this period.</EmptyState>
      ) : (
        <>
          <DetailCaption>{refreshVolumeSummary(refreshVolume)}</DetailCaption>
          <TitledBlock title="Rows fetched by day">
            <AdminTrendChart
              points={volumeTrend.points}
              labels={volumeTrend.labels}
              unit="count"
              ariaLabel="Rows fetched by day"
            />
          </TitledBlock>
        </>
      )}
      {priceOutcomes.length > 0 && (
        <TitledBlock title="Runs by outcome">
          <OutcomeBars outcomes={priceOutcomes} ariaLabel="Price-cron runs by outcome" />
        </TitledBlock>
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
        <EmptyState inset>No runs in this period.</EmptyState>
      ) : (
        <TitledBlock title="Runs by outcome">
          <OutcomeBars outcomes={outcomes} ariaLabel={ariaLabel} />
        </TitledBlock>
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
        <EmptyState inset kind="disconnected">Search Console not connected.</EmptyState>
      ) : (
        <>
          <DetailCaption>
            Google data lags ~2–3 days · last synced{' '}
            {lastSyncedAt
              ? `${lastSyncedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`
              : 'never'}
          </DetailCaption>
          {gscOutcomes.length > 0 && (
            <TitledBlock title="Sync runs by outcome">
              <OutcomeBars outcomes={gscOutcomes} ariaLabel="GSC sync runs by outcome" />
            </TitledBlock>
          )}
        </>
      )}
    </DetailBody>
  );
}

/** Every tracked cron's status and the outcomes behind it, as of the range end. */
export async function loadScheduledTasks(range: DateRange) {
  const [crons, refreshDays] = await Promise.all([loadCronSignals(range), getPriceRefreshDaysShared(range)]);
  return {
    statuses: deriveCronStatuses(crons, range.to),
    toned: {
      price: toneOutcomes(crons.priceOutcomes, CRON_OUTCOME_RULES.price),
      sde: toneOutcomes(crons.sdeOutcomes, CRON_OUTCOME_RULES.sde),
      gsc: toneOutcomes(crons.gscOutcomes, CRON_OUTCOME_RULES.gsc),
      housekeeping: toneOutcomes(crons.housekeepingOutcomes, CRON_OUTCOME_RULES.housekeeping),
    },
    refreshVolume: refreshVolumeOf(refreshDays),
    gscConfigured: crons.gscConfigured,
    lastSyncedAt: crons.gscLastSyncedAt,
  };
}

export function ScheduledTaskRows({ tasks }: { tasks: Awaited<ReturnType<typeof loadScheduledTasks>> }) {
  const { statuses, toned } = tasks;
  return (
    <>
      <StatusRow label="Price cron" status={statuses.price} share={shareOf(toned.price)}>
        <PriceCronDetail refreshVolume={tasks.refreshVolume} priceOutcomes={toned.price} />
      </StatusRow>

      <StatusRow label="SDE cron" status={statuses.sde} share={shareOf(toned.sde)}>
        <CronOutcomeDetail outcomes={toned.sde} ariaLabel="SDE-cron runs by outcome" />
      </StatusRow>

      <StatusRow label="GSC sync" status={statuses.gsc} share={shareOf(toned.gsc)}>
        <GscSyncDetail
          gscConfigured={tasks.gscConfigured}
          lastSyncedAt={tasks.lastSyncedAt}
          gscOutcomes={toned.gsc}
        />
      </StatusRow>

      <StatusRow label="Housekeeping" status={statuses.housekeeping} share={shareOf(toned.housekeeping)}>
        <CronOutcomeDetail outcomes={toned.housekeeping} ariaLabel="Housekeeping runs by outcome" />
      </StatusRow>
    </>
  );
}
