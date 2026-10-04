'use client';

import { type ReactNode, useMemo } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { EveImage } from '@/components/eve-image';
import { useEntityNames } from '@/components/use-entity-names';
import { AccessGate } from '@/components/ui/access-gate';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadFailed } from '@/components/ui/load-failed';
import { SectionLabel } from '@/components/ui/section-label';
import { ENTITY_NAMES_MAX_IDS } from '@/data/eve-data/api-contract';
import { corporationLogoUrl } from '@/lib/eve-image';
import type { CorpJobsResponse } from '../api-contract';
import type { IndustryJob } from '../esi-projection';
import { corpEntityIds, type CorpGroupState, corpGroupState, runnerName } from '../job-view';
import { useCorpJobsLive } from '../use-corp-jobs-live';
import { JobsCard, JobsCardSkeleton } from './JobsCard';

type CorpEntry = CorpJobsResponse['corporations'][number];

const CORP_ACCESS_REASON =
  "Reading your corporation's industry jobs needs corporation-roles and corporation-jobs access. Grant it to any linked character to see your corp jobs here.";

export function CorpJobsBoard({
  eligibleCharacterIds,
  reconnectAction,
}: {
  eligibleCharacterIds: number[];
  reconnectAction: ReactNode;
}) {
  return (
    <section aria-label="Corporation jobs" className="flex flex-col gap-4">
      <SectionLabel>Corporation jobs</SectionLabel>
      {eligibleCharacterIds.length === 0 ? (
        <AccessGate blocked reason={CORP_ACCESS_REASON} action={reconnectAction}>
          {null}
        </AccessGate>
      ) : (
        <LiveCorpJobs eligibleCharacterIds={eligibleCharacterIds} />
      )}
    </section>
  );
}

function LiveCorpJobs({ eligibleCharacterIds }: { eligibleCharacterIds: number[] }) {
  const { corporations, names, now, loading, failed, retry } = useCorpJobsLive(eligibleCharacterIds);

  if (loading) return <JobsCardSkeleton />;
  if (failed) {
    return (
      <LoadFailed
        title="Corporation jobs didn't load"
        retryLabel="Retry loading corporation jobs"
        onRetry={retry}
      />
    );
  }
  if (corporations.length === 0) {
    return (
      <Card>
        <EmptyState>No corporation jobs yet — they’ll appear here once a sync completes.</EmptyState>
      </Card>
    );
  }
  return <CorpJobsList corporations={corporations} names={names} now={now} />;
}

function CorpJobsList({
  corporations,
  names,
  now,
}: {
  corporations: CorpEntry[];
  names: Record<string, string>;
  now: number;
}) {
  const entityNames = useEntityNames(
    useMemo(() => corpEntityIds(corporations, ENTITY_NAMES_MAX_IDS), [corporations]),
  );
  return corporations.map((corp) => (
    <JobsCard
      key={corp.corporationId}
      avatar={
        <EveImage
          source="eve"
          family="corporation-logo"
          src={corporationLogoUrl(corp.corporationId, 64)}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-ctl border border-border-soft"
        />
      }
      title={entityNames[String(corp.corporationId)] ?? `Corporation #${corp.corporationId}`}
      notice={CORP_NOTICES[corpGroupState(corp)]}
      data={corp.data}
      lastSyncedAt={corp.lastRefreshedAt}
      names={names}
      now={now}
      loading={false}
      emptyRowsText="No corporation industry jobs running."
      runnerFor={(job) => <JobRunner job={job} entityNames={entityNames} />}
    />
  ));
}

const CORP_NOTICES: Record<CorpGroupState, ReactNode> = {
  'needs-role': (
    <Callout className="mx-3.5 my-2" label="Role needed">
      No linked character holds the Factory Manager or Director role in this corporation, so its
      industry jobs can’t be read. Granting more access can’t fix this — an in-game role change is
      required.
    </Callout>
  ),
  'sync-error': (
    <Callout className="mx-3.5 my-2" label="Sync trouble">
      Couldn’t read this corporation’s jobs on the last sync — the next one will retry.
    </Callout>
  ),
  empty: null,
  rows: null,
};

/** Who installed a corporation job, on the job's own line. */
function JobRunner({ job, entityNames }: { job: IndustryJob; entityNames: Record<string, string> }) {
  if (job.installer_id === undefined) return null;
  const name = runnerName(job.installer_id, entityNames);
  return (
    <span className="flex min-w-0 max-w-[12rem] shrink items-center gap-1.5">
      <CharacterPortrait characterId={job.installer_id} name={name} size={20} />
      <span className="truncate text-ui text-muted">{name}</span>
    </span>
  );
}
