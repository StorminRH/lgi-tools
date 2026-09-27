import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Dot } from '@/components/ui/dot';
import { EmptyState } from '@/components/ui/empty-state';
import { scrollArea } from '@/components/ui/scroll-area';
import { SectionHeader } from '@/components/ui/section-header';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { listRecentDomainEvents } from '@/data/domain-events/queries';
import {
  getCriticalLatencyP95,
  getEsiSuccessRate,
  getMutationSuccessRate,
  getReadSuccessRate,
} from '@/data/telemetry/queries';
import type { DateRange } from '@/data/telemetry/types';
import { loadSection, SECTION_LOAD_FAILED } from '../load-section';
import { summarizeDomainEvent } from '../ops-view';
import { getEsiRefreshQueueStatsShared } from '../queue-stats-shared';
import { SectionUnavailable } from '../SectionUnavailable';
import { summarizeQueue } from '../signals';
import { LEVEL_DOT_TONE, LEVEL_VALUE_CLASS } from '../status-tone';
import { deriveServiceLevels, type ServiceLevelRow } from './health-view';

const SERVICE_LEVEL_COLUMNS = [
  {
    key: 'indicator',
    label: 'Indicator',
    rowHeader: true,
    render: (row) => (
      <span className="flex items-start gap-3">
        <Dot tone={LEVEL_DOT_TONE[row.level]} size="lg" className="mt-1.5" />
        <span className="min-w-0">
          <span className="block text-text">{row.title}</span>
          <span className="block max-w-prose text-micro text-muted">{row.responseAction}</span>
        </span>
      </span>
    ),
  },
  {
    key: 'value',
    label: 'Value',
    align: 'right',
    render: (row) => <span className={LEVEL_VALUE_CLASS[row.level]}>{row.value}</span>,
    className: 'whitespace-nowrap tabular-nums',
  },
  {
    key: 'target',
    label: 'Target',
    align: 'right',
    render: (row) => row.target,
    className: 'hidden whitespace-nowrap text-muted md:table-cell',
    headerClassName: 'hidden md:table-cell',
  },
  {
    key: 'owner',
    label: 'Owner',
    align: 'right',
    render: (row) => row.owner,
    className: 'hidden text-muted md:table-cell',
    headerClassName: 'hidden md:table-cell',
  },
] satisfies readonly StaticTableColumn<ServiceLevelRow>[];

export async function ServiceLevelsCard({ range }: { range: DateRange }) {
  const fetched = await loadSection('service-levels', () =>
    Promise.all([
      getReadSuccessRate(range),
      getMutationSuccessRate(range),
      getCriticalLatencyP95(range),
      getEsiSuccessRate(range),
      getEsiRefreshQueueStatsShared(),
    ]),
  );
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Service levels" />;
  const [readSuccess, mutationSuccess, latencyP95, esiSuccess, queueStats] = fetched;
  const rows = deriveServiceLevels(
    { readSuccess, mutationSuccess, latencyP95, esiSuccess },
    summarizeQueue(queueStats, range.to),
  );
  return (
    <Card>
      <SectionHeader size="md" label="Service levels" hint="what to do when a line turns amber or red" />
      <StaticTable
        ariaLabel="Service levels"
        columns={SERVICE_LEVEL_COLUMNS}
        rows={rows}
        getRowKey={(row) => row.id}
      />
    </Card>
  );
}

export async function EventLogCard() {
  const fetched = await loadSection('recent-domain-events', () => listRecentDomainEvents(30));
  if (fetched === SECTION_LOAD_FAILED) return <SectionUnavailable label="Event log" />;
  return (
    <Card>
      <SectionHeader size="md" label="Event log" hint="latest 30 operational events" />
      {fetched.length === 0 ? (
        <EmptyState>No operational events recorded yet.</EmptyState>
      ) : (
        <ol className={cn(scrollArea, 'max-h-[420px] overflow-y-auto')}>
          {fetched.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-0.5 border-b border-border-soft px-3.5 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="shrink-0 font-data text-micro tabular-nums text-muted sm:w-[140px]">
                {event.occurredAt.toISOString().replace('T', ' ').slice(0, 16)} UTC
              </span>
              <span className="min-w-0 text-ui text-text">{summarizeDomainEvent(event)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
