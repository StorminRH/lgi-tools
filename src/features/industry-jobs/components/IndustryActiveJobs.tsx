'use client';

// The /industry dashboard's live Active-jobs table (MIGRATE.B.2), presentational
// since 3.7.24: the dashboard coordinator owns the jobs read (useJobsLive → the
// Neon stale-gated on-view read), the section chrome, and the loading/empty
// states — this renders the unified cross-character table it is handed. Each
// job's live "ready" + progress derives client-side from its absolute end_date
// against the render clock — a finishing job flips to ready with no reload and
// no scheduler.
import { useEffect, useRef } from 'react';
import { Pill } from '@/components/ui/pill';
import { initials } from '@/lib/format/names';
import type { IndustryJob } from '../esi-projection';
import { jobActivityPill } from '../industry-jobs-styles';
import { jobProgress } from '../job-state';
import { activeJobStatusText, formatEndDate, jobRowModel } from '../job-view';

export function IndustryActiveJobs({
  jobs,
  names,
  now,
}: {
  jobs: IndustryJob[];
  names: Record<string, string>;
  now: number;
}) {
  return (
    <div className="industry-jobs">
      <div className="industry-jobs-head">
        <span>Status</span>
        <span>Runs</span>
        <span>Blueprint</span>
        <span>Activity</span>
        <span>End date</span>
      </div>
      {jobs.map((job) => (
        <JobRow key={job.job_id} job={job} names={names} now={now} />
      ))}
    </div>
  );
}

function JobRow({
  job,
  names,
  now,
}: {
  job: IndustryJob;
  names: Record<string, string>;
  now: number;
}) {
  const { headlineId, remainingMs } = jobRowModel(job, now);
  const name = names[String(headlineId)] ?? `Type #${headlineId}`;
  const activity = jobActivityPill(job.activity_id);
  const isComplete = job.status === 'ready';

  return (
    <div className="industry-job-row">
      <div>
        {isComplete ? (
          <div className="industry-job-time complete">Complete ✓</div>
        ) : (
          <div className="industry-job-time">{activeJobStatusText(job.status, remainingMs)}</div>
        )}
        <IndustryJobBar pct={isComplete ? 100 : jobProgress(job, now)} />
      </div>
      <span className="industry-job-runs">×{job.runs}</span>
      <span className="industry-job-bp">
        <span className="industry-mono-bp">{initials(name)}</span>
        <span className="name">{name}</span>
      </span>
      <span>
        <Pill tone={activity.tone} size="sm">
          {activity.label}
        </Pill>
      </span>
      <span className="industry-job-end">{formatEndDate(job.end_date)}</span>
    </div>
  );
}

function IndustryJobBar({ pct }: { pct: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty('--pct', `${pct}%`);
  }, [pct]);
  return (
    <div className="industry-bar">
      <span ref={ref} className="industry-bar-fill" aria-hidden />
    </div>
  );
}
