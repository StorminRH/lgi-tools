'use client';

import { TypeIcon } from '@/components/type-icon';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { initials } from '@/lib/format/names';
import type { IndustryJob } from '../esi-projection';
import { jobActivityPill } from '../industry-jobs-styles';
import { jobProgress } from '../job-state';
import { activeJobStatusText, formatEndDate, jobRowModel } from '../job-view';

export function IndustryActiveJobs({
  jobs,
  names,
  now,
  pilotNames,
}: {
  jobs: IndustryJob[];
  names: Record<string, string>;
  now: number;
  /** Adds a pilot column, for a list that mixes pilots. */
  pilotNames?: Readonly<Record<number, string>>;
}) {
  const pilotColumn = {
    key: 'pilot',
    label: 'Pilot',
    className: 'whitespace-nowrap text-muted',
    render: (job: IndustryJob) =>
      (job.installer_id !== undefined ? pilotNames?.[job.installer_id] : undefined) ?? '—',
  } satisfies StaticTableColumn<IndustryJob>;
  const columns = [
    {
      key: 'status',
      label: 'Status',
      render: (job) => {
        const { remainingMs } = jobRowModel(job, now);
        const complete = job.status === 'ready';
        return (
          <div className="min-w-24">
            <div className={complete ? 'font-semibold text-isk' : 'text-muted'}>
              {complete ? 'Complete ✓' : activeJobStatusText(job.status, remainingMs)}
            </div>
            <ProgressBar pct={complete ? 100 : jobProgress(job, now)} tone="evb" />
          </div>
        );
      },
    },
    { key: 'runs', label: 'Runs', align: 'right', render: (job) => `×${job.runs}`, className: 'tabular-nums text-muted' },
    {
      key: 'blueprint',
      label: 'Blueprint',
      render: (job) => {
        const { headlineId, icon } = jobRowModel(job, now);
        const name = names[String(headlineId)] ?? `Type #${headlineId}`;
        return (
          <span className="flex min-w-0 items-center gap-2">
            <TypeIcon {...icon} size={26} mono={initials(name)} />
            <span className="truncate text-name">{name}</span>
          </span>
        );
      },
    },
    {
      key: 'activity',
      label: 'Activity',
      render: (job) => {
        const activity = jobActivityPill(job.activity_id);
        return <Pill tone={activity.tone} size="sm">{activity.label}</Pill>;
      },
    },
    { key: 'end', label: 'End date', render: (job) => formatEndDate(job.end_date), className: 'whitespace-nowrap text-muted' },
  ] satisfies readonly StaticTableColumn<IndustryJob>[];
  return (
    <StaticTable
      ariaLabel="Active industry jobs"
      columns={pilotNames === undefined ? columns : [...columns.slice(0, 3), pilotColumn, ...columns.slice(3)]}
      rows={jobs}
      getRowKey={(job) => job.job_id}
    />
  );
}
