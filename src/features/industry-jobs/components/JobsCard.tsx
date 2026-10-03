'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRemaining, formatUtcTime } from '@/lib/format/time';
import type { IndustryJob } from '../esi-projection';
import { jobRowFrameData, jobsCardModel } from '../job-view';
import type { CharacterJobsData } from '../types';
import { JobRow } from './JobRow';

/**
 * One board's jobs, a pilot's or a corporation's: whose they are, what is
 * wrong if anything, then the rows. Personal and corporation boards share
 * it so they read the same.
 */
export function JobsCard({
  avatar,
  title,
  notice,
  data,
  lastSyncedAt,
  names,
  now,
  loading,
  noDataText,
  emptyRowsText,
  runnerFor,
}: {
  avatar: ReactNode;
  title: string;
  /** Why the rows below are missing or stale. */
  notice?: ReactNode;
  data: CharacterJobsData | null;
  lastSyncedAt: number | null | undefined;
  names: Record<string, string>;
  now: number;
  loading: boolean;
  /** What stands in for the rows when there is no data; without it the notice says it all. */
  noDataText?: string;
  emptyRowsText: string;
  /** Who installed a job, where that is worth showing. */
  runnerFor?: (job: IndustryJob) => ReactNode;
}) {
  const model = jobsCardModel(data, now);
  const showRows = data !== null || loading || noDataText !== undefined;
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-border-soft px-3.5 py-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-h3 font-bold text-name">{title}</div>
          {model.subtitle !== null && <div className="text-label tracking-copy text-muted">{model.subtitle}</div>}
        </div>
        {model.nextDoneMs !== null && (
          <span className="shrink-0 font-data text-micro tracking-copy text-muted">
            next done in {formatRemaining(model.nextDoneMs)}
          </span>
        )}
      </div>
      {notice}
      {showRows && (
        <>
          <SectionHeader
            label="Industry jobs"
            hint={data !== null && lastSyncedAt != null ? `as of ${formatUtcTime(lastSyncedAt)}` : undefined}
          />
          <JobsCardRows
            data={data}
            names={names}
            now={now}
            loading={loading}
            noDataText={noDataText}
            emptyRowsText={emptyRowsText}
            runnerFor={runnerFor}
          />
        </>
      )}
    </Card>
  );
}

/** The rows, or what stands in for them before there are any to show. */
function JobsCardRows({
  data,
  names,
  now,
  loading,
  noDataText,
  emptyRowsText,
  runnerFor,
}: {
  data: CharacterJobsData | null;
  names: Record<string, string>;
  now: number;
  loading: boolean;
  noDataText?: string;
  emptyRowsText: string;
  runnerFor?: (job: IndustryJob) => ReactNode;
}) {
  if (data === null) return loading ? <JobRowsSkeleton /> : <EmptyState>{noDataText}</EmptyState>;
  if (data.jobs.length === 0) return <EmptyState>{emptyRowsText}</EmptyState>;
  return data.jobs.map((job) => (
    <JobRow key={job.job_id} {...jobRowFrameData(job, names, now)} runner={runnerFor?.(job)} />
  ));
}

/** Two placeholder rows in the shape of a job row: icon, name, time, progress. */
function JobRowsSkeleton() {
  return (
    <div className="flex flex-col">
      {[0, 1].map((row) => (
        <div key={row} className="flex flex-col gap-2 border-t border-border-soft px-3.5 py-2.5 first:border-t-0">
          <div className="flex items-center gap-2.5">
            {/* The first placeholder announces the load; the rest are decoration. */}
            <Skeleton
              label="Loading jobs"
              aria-hidden={row === 0 ? undefined : true}
              className="size-5.5 rounded-ctl"
            />
            <Skeleton aria-hidden className="h-3 w-48 max-w-[50%]" />
            <Skeleton aria-hidden className="ml-auto h-3 w-24" />
          </div>
          <Skeleton aria-hidden className="h-1 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A whole card while the boards themselves are still unknown. */
export function JobsCardSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-border-soft px-3.5 py-3">
        <Skeleton aria-hidden className="size-9 rounded-ctl" />
        <Skeleton aria-hidden className="h-4 w-40" />
      </div>
      <SectionHeader label="Industry jobs" />
      <JobRowsSkeleton />
    </Card>
  );
}
