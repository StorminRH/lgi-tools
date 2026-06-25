'use client';

// The /industry landing's live Active-jobs table (handoff §5). Reuses the
// industry-jobs Convex sync — the same `forViewer` query and presence-gated
// `useSyncSubject` engine the /jobs tracker uses — but renders one unified
// table across all of the viewer's characters with EVE-industry-blue progress
// bars. The character ids that drive the sync come from the server (Neon truth);
// the live job data, names, and progress are resolved client-side. No manual
// refresh control (live-data policy): the board refreshes itself on view and
// flips a job to ready on schedule.
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { Pill } from '@/components/ui/pill';
import { SectionLabel } from '@/components/ui/section-label';
import { api } from '@/data/convex/api';
import { convexClient } from '@/data/convex/client';
import { useSyncSubject } from '@/data/convex/use-sync-subject';
import { typeNamesEndpoint, TYPE_NAMES_MAX_IDS } from '@/data/eve-data/api-contract';
import { apiFetch } from '@/lib/api-client';
import { initials } from '@/lib/format/names';
import { formatRemaining } from '@/lib/format/time';
import type { IndustryJob } from '../esi-projection';
import { jobActivityPill } from '../industry-jobs-styles';
import { jobProgress } from '../job-state';

// Client-side re-render cadence for the progress + "done in" labels (the ready
// flip itself arrives over the websocket, not from this tick).
const TICK_MS = 30_000;

function JobsSection({ meta, children }: { meta?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <SectionLabel className="mb-3" meta={meta}>
        Active jobs
      </SectionLabel>
      {children}
    </section>
  );
}

export function IndustryActiveJobs({ characterIds }: { characterIds: number[] }) {
  if (convexClient === null) {
    return (
      <JobsSection>
        <Callout label="Unavailable">Live data is not configured on this build.</Callout>
      </JobsSection>
    );
  }
  return (
    <>
      <AuthLoading>
        <JobsSection>
          <LoadingLabel label="Connecting live session…" />
        </JobsSection>
      </AuthLoading>
      <Unauthenticated>
        <JobsSection>
          <EmptyState>Sign in with EVE (top right) to track your industry jobs here.</EmptyState>
        </JobsSection>
      </Unauthenticated>
      <Authenticated>
        <LiveJobs characterIds={characterIds} />
      </Authenticated>
    </>
  );
}

function LiveJobs({ characterIds }: { characterIds: number[] }) {
  const live = useQuery(api.industryJobs.forViewer);
  useSyncSubject('industryJobs', characterIds);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const jobs = useMemo<IndustryJob[]>(() => {
    const all: IndustryJob[] = [];
    for (const character of live?.characters ?? []) {
      for (const job of character.data?.jobs ?? []) all.push(job);
    }
    return all.sort(
      (a, b) => Date.parse(a.end_date) - Date.parse(b.end_date) || a.job_id - b.job_id,
    );
  }, [live]);

  // Resolve blueprint/product names client-side against Neon (names never live
  // in Convex) — the /jobs panel precedent.
  const typeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const job of jobs) {
      ids.add(job.blueprint_type_id);
      if (job.product_type_id !== undefined) ids.add(job.product_type_id);
    }
    return [...ids].sort((a, b) => a - b).slice(0, TYPE_NAMES_MAX_IDS);
  }, [jobs]);
  const [names, setNames] = useState<Record<string, string>>({});
  const typeIdsKey = typeIds.join(',');
  useEffect(() => {
    if (typeIdsKey === '') return;
    let cancelled = false;
    void apiFetch(typeNamesEndpoint, {
      body: { typeIds: typeIdsKey.split(',').map(Number) },
    }).then((result) => {
      if (!cancelled && result.ok) setNames((prev) => ({ ...prev, ...result.data.names }));
    });
    return () => {
      cancelled = true;
    };
  }, [typeIdsKey]);

  const completeCount = jobs.filter((job) => job.status === 'ready').length;
  const inProgressCount = jobs.filter((job) => job.status === 'active').length;

  const meta =
    jobs.length > 0 ? (
      <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted">
        <b className="text-evb-bright font-semibold">{completeCount}</b> complete ·{' '}
        <b className="text-evb-bright font-semibold">{inProgressCount}</b> in progress
      </span>
    ) : undefined;

  return (
    <JobsSection meta={meta}>
      {jobs.length === 0 ? (
        <EmptyState>No industry jobs running.</EmptyState>
      ) : (
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
      )}
    </JobsSection>
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
