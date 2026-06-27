'use client';

// The industry-jobs island (3.4.8). Receives the signed-in pilot's linked
// characters as server props (names, portraits, scope health — Neon truth at
// render time) and joins them with the live Convex projection: useQuery
// streams every sync write over the websocket — including the scheduled
// flip-to-ready at a job's end_date — so the board updates with no reload
// and no client polling. Liveness comes from the presence-gated engine
// (3.4.9): the visibility-gated heartbeat keeps this subject hot while the
// tab is watched, and the engine refreshes it on the dataset's cadence —
// the ids it sends are a freshness hint only, never authority. The session gate
// and the whole live panel (sync hook, status line, per-character card shell)
// are shared with the skill-queue panel (src/components/live-character-card);
// this slice supplies only its row, summary, and id-extraction.
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  type CharacterCardContent,
  LiveCharacterPanel,
  LiveSessionGate,
  type PanelCharacter,
} from '@/components/live-character-card';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { api } from '@/data/convex/api';
import { formatRemaining } from '@/lib/format/time';
import type { IndustryJob } from '../esi-projection';
import { jobProgress, summarizeJobs } from '../job-state';
import { JOB_STATUS_META, jobActivityLabel } from '../industry-jobs-styles';

export function IndustryJobsPanel({ characters }: { characters: PanelCharacter[] }) {
  return (
    <LiveSessionGate
      characters={characters}
      emptyText={
        <>
          No characters linked to this account —{' '}
          <a href="/characters" className="underline text-name">
            link one on the Characters page
          </a>{' '}
          to see live industry jobs.
        </>
      }
    >
      <LiveJobs characters={characters} />
    </LiveSessionGate>
  );
}

type LiveCharacter = NonNullable<
  FunctionReturnType<typeof api.industryJobs.forViewer>
>['characters'][number];

// The one per-feature seam of useLiveCharacterSync: which type ids to resolve to
// names. Module-stable so it can sit in the hook's dependency list. Exported so
// the /industry active-jobs board AND the corp board reuse the same extraction —
// it reads only the `data.jobs` each live entry carries (per character or per
// corporation), so both the per-character and per-corp live shapes satisfy it.
export function jobTypeIds(entries: { data: { jobs: IndustryJob[] } | null }[]): number[] {
  const ids: number[] = [];
  for (const entry of entries) {
    for (const job of entry.data?.jobs ?? []) {
      ids.push(job.blueprint_type_id);
      if (job.product_type_id !== undefined) ids.push(job.product_type_id);
    }
  }
  return ids;
}

function LiveJobs({ characters }: { characters: PanelCharacter[] }) {
  const live = useQuery(api.industryJobs.forViewer);
  return (
    <LiveCharacterPanel
      live={live}
      characters={characters}
      dataset="industryJobs"
      extractTypeIds={jobTypeIds}
      liveLabel="Live · jobs flip to ready on schedule"
      sectionLabel="Industry jobs"
      scopePhrase="the industry scope"
      noun="jobs"
      emptyRowsText="No industry jobs running."
      renderCard={renderJobsCard}
    />
  );
}

// One character's jobs-card content: the jobs-count subtitle, the "next done in"
// header slot, and the per-job rows. The panel owns the card shell.
function renderJobsCard(
  live: LiveCharacter | undefined,
  names: Record<string, string>,
  now: number,
): CharacterCardContent {
  const data = live?.data ?? null;
  const summary = data !== null ? summarizeJobs(data.jobs, now) : null;

  const subtitle = summary !== null && (
    <div className="text-[10px] text-muted tracking-[0.06em]">
      {summary.total === 1 ? '1 job' : `${summary.total} jobs`}
      {summary.readyCount > 0 ? ` · ${summary.readyCount} ready` : ''}
      {summary.pausedCount > 0 ? ` · ${summary.pausedCount} paused` : ''}
    </div>
  );

  const headerRight = summary !== null && summary.nextEndAt !== null && (
    <span className="text-[10px] text-muted tracking-[0.06em] shrink-0">
      next done in {formatRemaining(summary.nextEndAt - now)}
    </span>
  );

  return {
    isEmpty: data !== null && data.jobs.length === 0,
    subtitle,
    headerRight,
    rows:
      data !== null &&
      data.jobs.map((job) => <JobRow key={job.job_id} job={job} names={names} now={now} />),
  };
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
  const meta = JOB_STATUS_META[job.status];
  // The product is the headline where one exists (manufacturing, invention,
  // reactions); research/copy jobs are about the blueprint itself.
  const headlineId = job.product_type_id ?? job.blueprint_type_id;
  const end = Date.parse(job.end_date);

  return (
    <div className="border-t border-border-soft px-3.5 py-[6px]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-[6px] text-[12px]">
        <span className="text-name truncate leading-[1.5]">
          {names[String(headlineId)] ?? `Type #${headlineId}`}{' '}
          <span className="text-muted">
            ×{job.runs} · {jobActivityLabel(job.activity_id)}
          </span>
        </span>
        <span className="text-[10px] text-muted shrink-0">
          {job.status === 'active' && Number.isFinite(end)
            ? `done in ${formatRemaining(end - now)}`
            : ''}
        </span>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      {(job.status === 'active' || job.status === 'paused') && (
        <div className="mt-[4px]">
          <ProgressBar pct={jobProgress(job, now)} />
        </div>
      )}
    </div>
  );
}
