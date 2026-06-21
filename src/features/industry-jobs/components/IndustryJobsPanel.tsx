'use client';

// The industry-jobs island (3.4.8). Receives the signed-in pilot's linked
// characters as server props (names, portraits, scope health — Neon truth at
// render time) and joins them with the live Convex projection: useQuery
// streams every sync write over the websocket — including the scheduled
// flip-to-ready at a job's end_date — so the board updates with no reload
// and no client polling. Liveness comes from the presence-gated engine
// (3.4.9): the visibility-gated heartbeat keeps this subject hot while the
// tab is watched, and the engine refreshes it on the dataset's cadence —
// the ids it sends are a freshness hint only, never authority. The session
// gate, live-sync hook, and card shell are shared with the skill-queue panel
// (src/components/live-character-card).
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  LiveCharacterCard,
  LiveSessionGate,
  type PanelCharacter,
  useLiveCharacterSync,
} from '@/components/live-character-card';
import { syncErrorMeta } from '@/components/live-character-sync';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { useLoadingToast } from '@/components/ui/loading-toast';
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

// The one per-feature seam of useLiveCharacterSync: which type ids to resolve
// to names. Module-stable so it can sit in the hook's dependency list.
function jobTypeIds(characters: LiveCharacter[]): number[] {
  const ids: number[] = [];
  for (const character of characters) {
    for (const job of character.data?.jobs ?? []) {
      ids.push(job.blueprint_type_id);
      if (job.product_type_id !== undefined) ids.push(job.product_type_id);
    }
  }
  return ids;
}

function LiveJobs({ characters }: { characters: PanelCharacter[] }) {
  const live = useQuery(api.industryJobs.forViewer);
  const { liveByCharacter, names, now, syncing, runError } = useLiveCharacterSync({
    live,
    dataset: 'industryJobs',
    characterIds: characters.map((c) => c.characterId),
    extractTypeIds: jobTypeIds,
  });

  // Drop the sitewide loading toast while an ESI character sync is running.
  useLoadingToast(syncing);

  return (
    <div className="w-full max-w-[760px] flex flex-col gap-6">
      <div className="flex items-center">
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted">
          {syncing ? 'Syncing from ESI…' : 'Live · jobs flip to ready on schedule'}
        </span>
      </div>

      {runError !== null && (
        <Card>
          <Callout label="Sync trouble">
            {syncErrorMeta(runError.split(':')[0] ?? runError).label} — showing the last
            synced data below.
          </Callout>
        </Card>
      )}

      {characters.map((character) => (
        <CharacterJobsCard
          key={character.characterId}
          character={character}
          live={liveByCharacter.get(character.characterId)}
          names={names}
          now={now}
          syncing={syncing}
        />
      ))}
    </div>
  );
}

function CharacterJobsCard({
  character,
  live,
  names,
  now,
  syncing,
}: {
  character: PanelCharacter;
  live: LiveCharacter | undefined;
  names: Record<string, string>;
  now: number;
  syncing: boolean;
}) {
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

  return (
    <LiveCharacterCard
      character={character}
      syncError={live?.syncError}
      lastSyncedAt={live?.lastSyncedAt}
      hasData={data !== null}
      isEmpty={data !== null && data.jobs.length === 0}
      syncing={syncing}
      sectionLabel="Industry jobs"
      scopePhrase="the industry scope"
      noun="jobs"
      subtitle={subtitle}
      headerRight={headerRight}
      emptyRowsText="No industry jobs running."
    >
      {data !== null &&
        data.jobs.map((job) => <JobRow key={job.job_id} job={job} names={names} now={now} />)}
    </LiveCharacterCard>
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
