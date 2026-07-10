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
import { formatRemaining } from '@/lib/format/time';
import type { IndustryJob } from '../esi-projection';
import { jobActivityPill } from '../industry-jobs-styles';
import { jobProgress } from '../job-state';

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
  const headlineId = job.product_type_id ?? job.blueprint_type_id;
  const name = names[String(headlineId)] ?? `Type #${headlineId}`;
  const activity = jobActivityPill(job.activity_id);
  const end = Date.parse(job.end_date);
  const isComplete = job.status === 'ready';

  return (
    <div className="industry-job-row">
      <div>
        {isComplete ? (
          <div className="industry-job-time complete">Complete ✓</div>
        ) : (
          <div className="industry-job-time">
            {job.status === 'active' && Number.isFinite(end)
              ? formatRemaining(end - now)
              : `${job.status.charAt(0).toUpperCase()}${job.status.slice(1)}`}
          </div>
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

// EVE's in-client end-date format (YYYY.MM.DD HH:MM), in the viewer's local tz.
function formatEndDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
