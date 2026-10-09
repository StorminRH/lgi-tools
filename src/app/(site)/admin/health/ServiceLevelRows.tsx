import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import type { DeadLetterRow, EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import type { CapabilityFailureDetail, FailureGroup, SlowOperation } from '@/data/telemetry/capability-stats';
import type { DateRange } from '@/data/telemetry/types';
import { trendSeries } from '@/composition/admin-period';
import { zeroFillDaily } from '../aggregate';
import { CardLink } from '../CardLink';
import { AdminTrendChart } from '../charts';
import { SECTION_LOAD_FAILED } from '../load-section';
import { deriveDeadLetterView } from '../ops-view';
import { deriveQueueCells } from '../queue/queue-view';
import type { Loaded } from '../signals';
import { ChartBlock, DetailBody, DetailCaption } from './DetailBlocks';
import { StatusRow } from './StatusRow';
import {
  dayLabel,
  failureResultLabel,
  operationLabel,
  slowOperationNote,
  type ServiceLevelRow,
} from './health-view';

export interface FailureDetail extends CapabilityFailureDetail {
  range: DateRange;
}

export interface ServiceLevelDetails {
  /** The card's clock, so queue ages match the headline. */
  now: Date;
  read: Loaded<FailureDetail>;
  mutation: Loaded<FailureDetail>;
  slowest: Loaded<SlowOperation[]>;
  esi: Loaded<FailureGroup[]>;
  queue: Loaded<EsiRefreshQueueStat[]>;
  deadLetters: Loaded<DeadLetterRow[]>;
}

export const DEAD_LETTER_PREVIEW = 5;

const FAILURE_COLUMNS = [
  {
    key: 'operation',
    label: 'Operation',
    rowHeader: true,
    render: (row) => (
      <span className="block min-w-0">
        <span className="block text-text">{operationLabel(row)}</span>
        <span className="block break-all text-micro text-tone-red">{failureResultLabel(row)}</span>
      </span>
    ),
  },
  {
    key: 'count',
    label: 'Count',
    align: 'right',
    render: (row) => row.count.toLocaleString(),
    className: 'tabular-nums',
  },
  {
    key: 'last',
    label: 'Last seen',
    align: 'right',
    render: (row) => dayLabel(row.lastSeen),
    className: 'whitespace-nowrap text-muted tabular-nums',
  },
] satisfies readonly StaticTableColumn<FailureGroup>[];

const SLOW_COLUMNS = [
  {
    key: 'operation',
    label: 'Operation',
    rowHeader: true,
    render: (row) => (
      <span className="block min-w-0">
        <span className="block text-text">{operationLabel(row)}</span>
        <span className="block text-micro text-muted">{slowOperationNote(row)}</span>
      </span>
    ),
  },
  {
    key: 'p95',
    label: 'p95',
    align: 'right',
    render: (row) => `${row.p95Ms.toLocaleString()} ms`,
    className: 'whitespace-nowrap tabular-nums',
  },
] satisfies readonly StaticTableColumn<SlowOperation>[];

function Unavailable() {
  return <DetailCaption>Details unavailable.</DetailCaption>;
}

function FailureTable({ groups, label }: { groups: FailureGroup[]; label: string }) {
  if (groups.length === 0) return <EmptyState>No failures in this period.</EmptyState>;
  return (
    <ChartBlock label={label}>
      <StaticTable
        ariaLabel={label}
        columns={FAILURE_COLUMNS}
        rows={groups}
        getRowKey={(row) => `${operationLabel(row)}:${failureResultLabel(row)}`}
      />
    </ChartBlock>
  );
}

function FailureDetailBody({ detail }: { detail: Loaded<FailureDetail> }) {
  if (detail === SECTION_LOAD_FAILED) return <Unavailable />;
  const series = zeroFillDaily(
    detail.daily.map((point) => ({ day: point.day, value: point.failures })),
    dayLabel(detail.range.from),
    dayLabel(new Date(detail.range.to.getTime() - 1)),
  );
  const trend = trendSeries(series.days, series.values);
  return (
    <>
      <FailureTable groups={detail.groups} label="Top failure groups" />
      {detail.daily.some((point) => point.failures > 0) && (
        <ChartBlock label="Failures by day">
          <AdminTrendChart
            points={trend.points}
            labels={trend.labels}
            unit="count"
            tone="red"
            ariaLabel="Failures by day"
          />
        </ChartBlock>
      )}
      {detail.validationRejected !== undefined && detail.validationRejected > 0 && (
        <DetailCaption>
          {detail.validationRejected.toLocaleString()} rejected as invalid input, not counted.
        </DetailCaption>
      )}
    </>
  );
}

function SlowestBody({ slowest }: { slowest: Loaded<SlowOperation[]> }) {
  if (slowest === SECTION_LOAD_FAILED) return <Unavailable />;
  if (slowest.length === 0) return <EmptyState>No operations in this period.</EmptyState>;
  return (
    <ChartBlock label="Slowest operations">
      <StaticTable
        ariaLabel="Slowest operations"
        columns={SLOW_COLUMNS}
        rows={slowest}
        getRowKey={operationLabel}
      />
    </ChartBlock>
  );
}

function EsiBody({ esi }: { esi: Loaded<FailureGroup[]> }) {
  if (esi === SECTION_LOAD_FAILED) return <Unavailable />;
  return <FailureTable groups={esi} label="Top ESI failure groups" />;
}

function BacklogBody({ details }: { details: ServiceLevelDetails }) {
  const { now, queue, deadLetters } = details;
  return (
    <>
      {queue === SECTION_LOAD_FAILED ? (
        <Unavailable />
      ) : (
        <DetailCaption>
          {deriveQueueCells(queue, now)
            .map((cell) => `${cell.title} ${cell.value}`)
            .join(' · ')}
        </DetailCaption>
      )}
      {deadLetters === SECTION_LOAD_FAILED ? (
        <Unavailable />
      ) : deadLetters.length === 0 ? (
        <EmptyState>No dead-lettered jobs.</EmptyState>
      ) : (
        <ChartBlock label="Latest dead letters">
          <ul>
            {deriveDeadLetterView(deadLetters).map((row) => (
              <li key={row.id} className="border-b border-border-soft py-2 last:border-b-0">
                <div className="text-ui text-text">{row.title}</div>
                <div className="break-all font-data text-micro text-muted">
                  <span className="text-tone-red">{row.failureClass}</span> · {row.timing}
                </div>
              </li>
            ))}
          </ul>
        </ChartBlock>
      )}
      <div className="font-data text-ui">
        <CardLink href="/admin/queue">Open queue</CardLink>
      </div>
    </>
  );
}

function detailFor(row: ServiceLevelRow, details: ServiceLevelDetails): ReactNode {
  switch (row.id) {
    case 'read_success_rate':
      return <FailureDetailBody detail={details.read} />;
    case 'mutation_success_rate':
      return <FailureDetailBody detail={details.mutation} />;
    case 'critical_latency_p95':
      return <SlowestBody slowest={details.slowest} />;
    case 'esi_success_rate':
      return <EsiBody esi={details.esi} />;
    case 'job_backlog':
      return <BacklogBody details={details} />;
  }
}

export function ServiceLevelRows({
  rows,
  details,
}: {
  rows: ServiceLevelRow[];
  details: ServiceLevelDetails;
}) {
  return (
    <div>
      {rows.map((row) => (
        <StatusRow key={row.id} label={row.label} status={row}>
          <DetailBody>
            <DetailCaption>{row.responseAction}</DetailCaption>
            {detailFor(row, details)}
          </DetailBody>
        </StatusRow>
      ))}
    </div>
  );
}
