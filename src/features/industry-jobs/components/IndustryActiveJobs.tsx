'use client';

// The /industry dashboard's live Active-jobs table (MIGRATE.B.2), presentational
// since 3.7.24: the dashboard coordinator owns the jobs read (useJobsLive → the
// Neon stale-gated on-view read), the section chrome, and the loading/empty
// states — this renders the unified cross-character table it is handed. Each
// job's live "ready" + progress derives client-side from its absolute end_date
// against the render clock — a finishing job flips to ready with no reload and
// no scheduler.
import { TypeIcon } from '@/components/type-icon';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { StaticTable, type StaticTableColumn } from '@/components/ui/static-table';
import { initials } from '@/lib/format/names';
import type { IndustryJob } from '../esi-projection';
import { jobActivityPill } from '../industry-jobs-styles';
import { jobProgress } from '../job-state';
import { activeJobStatusText, formatEndDate, jobRowModel } from '../job-view';

/** Renders active personal jobs with progress and completion timing from normalized job rows. */
export function IndustryActiveJobs({
  jobs,
  names,
  now,
}: {
  jobs: IndustryJob[];
  names: Record<string, string>;
  now: number;
}) {
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
      columns={columns}
      rows={jobs}
      getRowKey={(job) => job.job_id}
    />
  );
}
