import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import type { DeadLetterRow, EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import type {
  CapabilityFailureDetail,
  EsiClientErrorGroup,
  EsiClientErrorSummary,
  FailureGroup,
  SlowOperation,
} from '@/data/telemetry/capability-stats';
import type { DateRange } from '@/data/telemetry/types';
import { trendSeries } from '@/composition/admin-period';
import { formatQuantity } from '@/lib/format/number';
import { zeroFillDaily } from '../aggregate';
import { CardLink } from '../CardLink';
import { AdminTrendChart } from '../charts';
import { SECTION_LOAD_FAILED } from '../load-section';
import { deriveDeadLetterView } from '../ops-view';
import { deriveQueueCells } from '../queue/queue-view';
import type { Loaded } from '../signals';
import { TitledBlock } from '../TitledBlock';
import { DetailBody, DetailCaption } from './DetailBlocks';
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
  esiClientErrors: Loaded<EsiClientErrorSummary>;
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
    render: (row) => formatQuantity(row.count),
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
    render: (row) => `${formatQuantity(row.p95Ms)} ms`,
    className: 'whitespace-nowrap tabular-nums',
  },
] satisfies readonly StaticTableColumn<SlowOperation>[];

const CLIENT_ERROR_COLUMNS = [
  {
    key: 'operation',
    label: 'Operation',
    rowHeader: true,
    render: (row) => <span className="block min-w-0 text-text">{operationLabel(row)}</span>,
  },
  {
    key: 'errors',
    label: '4xx',
    align: 'right',
    render: (row) => formatQuantity(row.errors),
    className: 'tabular-nums',
  },
  {
    key: 'share',
    label: 'Of calls',
    align: 'right',
    render: (row) => (row.calls > 0 ? `${((row.errors / row.calls) * 100).toFixed(1)}%` : '—'),
    className: 'tabular-nums',
  },
  {
    key: 'last',
    label: 'Last seen',
    align: 'right',
    render: (row) => (row.lastSeen === null ? '—' : dayLabel(row.lastSeen)),
    className: 'whitespace-nowrap text-muted tabular-nums',
  },
] satisfies readonly StaticTableColumn<EsiClientErrorGroup>[];

function Unavailable() {
  return <EmptyState inset kind="unavailable">Details unavailable.</EmptyState>;
}

function FailureTable({ groups, label }: { groups: FailureGroup[]; label: string }) {
  if (groups.length === 0) return <EmptyState inset kind="clear">No failures in this period.</EmptyState>;
  return (
    <TitledBlock title={label}>
      <StaticTable
        ariaLabel={label}
        columns={FAILURE_COLUMNS}
        rows={groups}
        getRowKey={(row) => `${operationLabel(row)}:${failureResultLabel(row)}`}
      />
    </TitledBlock>
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
        <TitledBlock title="Failures by day">
          <AdminTrendChart
            points={trend.points}
            labels={trend.labels}
            unit="count"
            tone="red"
            ariaLabel="Failures by day"
          />
        </TitledBlock>
      )}
      {detail.validationRejected !== undefined && detail.validationRejected > 0 && (
        <DetailCaption>
          {formatQuantity(detail.validationRejected)} rejected as invalid input, not counted.
        </DetailCaption>
      )}
    </>
  );
}

function SlowestBody({ slowest }: { slowest: Loaded<SlowOperation[]> }) {
  if (slowest === SECTION_LOAD_FAILED) return <Unavailable />;
  if (slowest.length === 0) return <EmptyState inset>No operations in this period.</EmptyState>;
  return (
    <TitledBlock title="Slowest operations">
      <StaticTable
        ariaLabel="Slowest operations"
        columns={SLOW_COLUMNS}
        rows={slowest}
        getRowKey={operationLabel}
      />
    </TitledBlock>
  );
}

function ClientErrorTable({ summary }: { summary: Loaded<EsiClientErrorSummary> }) {
  if (summary === SECTION_LOAD_FAILED) return <Unavailable />;
  if (summary.groups.length === 0) {
    return <EmptyState inset kind="clear">No 4xx answers from ESI in this period.</EmptyState>;
  }
  return (
    <TitledBlock title="ESI 4xx answers">
      <StaticTable
        ariaLabel="ESI 4xx answers"
        columns={CLIENT_ERROR_COLUMNS}
        rows={summary.groups}
        getRowKey={operationLabel}
      />
    </TitledBlock>
  );
}

function EsiBody({ details }: { details: ServiceLevelDetails }) {
  return (
    <>
      {details.esi === SECTION_LOAD_FAILED
        ? <Unavailable />
        : <FailureTable groups={details.esi} label="Top ESI failure groups" />}
      <ClientErrorTable summary={details.esiClientErrors} />
    </>
  );
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
        <EmptyState inset kind="clear">No dead-lettered jobs.</EmptyState>
      ) : (
        <TitledBlock title="Latest dead letters">
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
        </TitledBlock>
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
      return <EsiBody details={details} />;
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
