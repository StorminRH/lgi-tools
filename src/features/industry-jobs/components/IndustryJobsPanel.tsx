'use client';

// The industry-jobs island (3.4.8). Receives the signed-in pilot's linked
// characters as server props (names, portraits, scope health — Neon truth at
// render time) and joins them with the live Convex projection: useQuery
// streams every sync write over the websocket — including the scheduled
// flip-to-ready at a job's end_date — so the board updates with no reload
// and no client polling. Liveness comes from the presence-gated engine
// (3.4.9): the visibility-gated heartbeat keeps this subject hot while the
// tab is watched, and the engine refreshes it on the dataset's cadence —
// the ids it sends are a freshness hint only, never authority.
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useMemo, useState } from 'react';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionHeader } from '@/components/ui/section-header';
import { api } from '@/data/convex/api';
import { convexClient } from '@/data/convex/client';
import { useSyncSubject } from '@/data/convex/use-sync-subject';
import { typeNamesEndpoint, TYPE_NAMES_MAX_IDS } from '@/data/eve-data/api-contract';
import { apiFetch } from '@/lib/api-client';
import { formatRemaining } from '@/lib/format';
import type { IndustryJob } from '../esi-projection';
import { jobProgress, summarizeJobs } from '../job-state';
import { JOB_STATUS_META, jobActivityLabel, syncErrorMeta } from '../industry-jobs-styles';

export interface PanelCharacter {
  characterId: number;
  name: string;
  portraitUrl: string;
  needsReconnect: boolean;
}

export function IndustryJobsPanel({ characters }: { characters: PanelCharacter[] }) {
  if (convexClient === null) {
    return (
      <Card>
        <Callout label="Unavailable">
          Live data is not configured on this build (no Convex deployment).
        </Callout>
      </Card>
    );
  }
  return (
    <>
      <AuthLoading>
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted">
          Connecting live session…
        </span>
      </AuthLoading>
      <Unauthenticated>
        <Card>
          <Callout label="Heads up">
            Live session unavailable — try reloading, or signing out and back in.
          </Callout>
        </Card>
      </Unauthenticated>
      <Authenticated>
        <LiveJobs characters={characters} />
      </Authenticated>
    </>
  );
}

// Re-render cadence for the client-side timestamp math — progress bars and
// "done in" labels stay honest without any data traffic. (The ready flip
// itself arrives over the websocket, not from this tick.)
const TICK_MS = 30_000;

function LiveJobs({ characters }: { characters: PanelCharacter[] }) {
  const live = useQuery(api.industryJobs.forViewer);
  // Presence + on-view sync: rendered only inside <Authenticated>, so Convex
  // auth is established before the first heartbeat. The engine decides
  // whether a run is actually warranted (freshness gate, in-flight dedupe)
  // and keeps the subject refreshing while this tab stays visible.
  const syncNow = useSyncSubject(
    'industryJobs',
    characters.map((c) => c.characterId),
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // SDE name enrichment, client-side: resolve the blueprint/product type ids
  // present in the live docs against Neon. Names never live in Convex.
  const typeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const character of live?.characters ?? []) {
      for (const job of character.data?.jobs ?? []) {
        ids.add(job.blueprint_type_id);
        if (job.product_type_id !== undefined) ids.add(job.product_type_id);
      }
    }
    return [...ids].sort((a, b) => a - b).slice(0, TYPE_NAMES_MAX_IDS);
  }, [live]);
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

  const liveByCharacter = new Map(
    (live?.characters ?? []).map((character) => [character.characterId, character]),
  );
  const syncing = live?.syncState?.status === 'running';
  const runError = live?.syncState?.lastError ?? null;

  return (
    <div className="w-full max-w-[760px] flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted">
          {syncing ? 'Syncing from ESI…' : 'Live · jobs flip to ready on schedule'}
        </span>
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="font-mono text-[10px] tracking-[0.1em] uppercase border border-border rounded-[2px] px-3 py-1.5 text-name hover:bg-surface-raised cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
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

type LiveCharacter = NonNullable<
  FunctionReturnType<typeof api.industryJobs.forViewer>
>['characters'][number];

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

  return (
    <Card>
      <div className="flex items-center gap-3 px-3.5 py-3 border-b border-border-soft">
        <img
          src={character.portraitUrl}
          alt={character.name}
          width={36}
          height={36}
          className="rounded-[2px] border border-border-idle"
        />
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-[15px] text-name truncate">
            {character.name}
          </div>
          {summary !== null && (
            <div className="text-[10px] text-muted tracking-[0.06em]">
              {summary.total === 1 ? '1 job' : `${summary.total} jobs`}
              {summary.readyCount > 0 ? ` · ${summary.readyCount} ready` : ''}
              {summary.pausedCount > 0 ? ` · ${summary.pausedCount} paused` : ''}
            </div>
          )}
        </div>
        {summary !== null && summary.nextEndAt !== null && (
          <span className="text-[10px] text-muted tracking-[0.06em] shrink-0">
            next done in {formatRemaining(summary.nextEndAt - now)}
          </span>
        )}
      </div>

      {character.needsReconnect && (
        <Callout label="Reconnect">
          This character is missing the industry scope —{' '}
          <a href="/characters" className="underline text-name">
            reconnect it on the Characters page
          </a>{' '}
          to sync its jobs.
        </Callout>
      )}

      {!character.needsReconnect && live?.syncError != null && (
        <Callout label={syncErrorMeta(live.syncError).label}>
          {data !== null && live.lastSyncedAt !== null
            ? `Couldn't refresh — showing data as of ${new Date(live.lastSyncedAt).toLocaleTimeString()}.`
            : "Couldn't fetch this character's jobs yet."}
        </Callout>
      )}

      <SectionHeader
        label="Industry jobs"
        hint={
          data !== null && live?.lastSyncedAt != null
            ? `as of ${new Date(live.lastSyncedAt).toLocaleTimeString()}`
            : undefined
        }
      />

      {data === null ? (
        <EmptyState>
          {character.needsReconnect
            ? 'Nothing synced for this character.'
            : syncing
              ? 'Syncing…'
              : 'Awaiting first sync.'}
        </EmptyState>
      ) : data.jobs.length === 0 ? (
        <EmptyState>No industry jobs running.</EmptyState>
      ) : (
        data.jobs.map((job) => (
          <JobRow key={job.job_id} job={job} names={names} now={now} />
        ))
      )}
    </Card>
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
