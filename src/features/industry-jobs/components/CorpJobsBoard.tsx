'use client';

import { type ReactNode, useMemo } from 'react';
import { EveImage } from '@/components/eve-image';
import { useEntityNames } from '@/components/use-entity-names';
import { AccessGate } from '@/components/ui/access-gate';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { SectionLabel } from '@/components/ui/section-label';
import { ENTITY_NAMES_MAX_IDS } from '@/data/eve-data/api-contract';
import { characterPortraitUrl, corporationLogoUrl } from '@/lib/eve-image';
import type { CorpJobsResponse } from '../api-contract';
import type { IndustryJob } from '../esi-projection';
import { corpEntityIds, corpGroupState, jobRowFrameData, runnerName } from '../job-view';
import { useCorpJobsLive } from '../use-corp-jobs-live';
import { JobRowFrame } from './JobRowFrame';

export type CorpEntry = CorpJobsResponse['corporations'][number];

export const CORP_ACCESS_REASON =
  "Reading your corporation's industry jobs needs corporation-roles and corporation-jobs access. Grant it to any linked character to see your corp jobs here.";

export function CorpJobsBoard({
  eligibleCharacterIds,
  hasLinkedCharacters,
  reconnectAction,
}: {
  eligibleCharacterIds: number[];
  hasLinkedCharacters: boolean;
  reconnectAction: ReactNode;
}) {
  if (!hasLinkedCharacters) return null;

  return (
    <section>
      <SectionLabel className="mb-cluster">Corporation industry jobs</SectionLabel>
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
  const { corporations, names, now, loading } = useCorpJobsLive(eligibleCharacterIds);

  if (loading) return <LoadingLabel label="Loading…" />;

  if (corporations.length === 0) {
    return (
      <Card>
        <EmptyState>
          No corporation industry jobs yet — they’ll appear here once a sync completes.
        </EmptyState>
      </Card>
    );
  }

  return <CorpJobsList corporations={corporations} names={names} now={now} />;
}

export function CorpJobsList({
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
  return (
    <div className="flex flex-col gap-6">
      {corporations.map((corp) => (
        <CorpGroup
          key={corp.corporationId}
          corp={corp}
          corpName={entityNames[String(corp.corporationId)]}
          names={names}
          entityNames={entityNames}
          now={now}
        />
      ))}
    </div>
  );
}

interface CorpGroupBodyProps {
  corp: CorpEntry;
  corpLabel: string;
  names: Record<string, string>;
  entityNames: Record<string, string>;
  now: number;
}

function CorpGroupHeader({ corpId, label }: { corpId: number; label: string }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 border-b border-border-soft">
      <EveImage
        source="eve"
        family="corporation-logo"
        src={corporationLogoUrl(corpId, 64)}
        alt=""
        width={28}
        height={28}
        className="w-7 h-7 rounded-ctl border border-border-soft shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="font-display font-bold text-h3 text-name truncate">{label}</div>
        <div className="text-label text-muted tracking-copy">Corporation industry jobs</div>
      </div>
    </div>
  );
}

function CorpNotice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="p-3.5">
      <Callout label={label}>{children}</Callout>
    </div>
  );
}

const CORP_GROUP_BODY: Record<ReturnType<typeof corpGroupState>, (props: CorpGroupBodyProps) => ReactNode> = {
  'needs-role': () => (
    <CorpNotice label="Role needed">
      No linked character holds the Factory Manager or Director role in this corporation, so its
      industry jobs can’t be read. Granting more access can’t fix this — an in-game role change is
      required.
    </CorpNotice>
  ),
  'sync-error': () => (
    <CorpNotice label="Sync trouble">
      Couldn’t read this corporation’s jobs on the last sync — the next one will retry.
    </CorpNotice>
  ),
  empty: () => <EmptyState>No corporation industry jobs running.</EmptyState>,
  rows: ({ corp, corpLabel, names, entityNames, now }) =>
    (corp.data?.jobs ?? []).map((job) => (
      <CorpJobRow
        key={job.job_id}
        job={job}
        corpId={corp.corporationId}
        corpName={corpLabel}
        names={names}
        entityNames={entityNames}
        now={now}
      />
    )),
};

function CorpGroupBody(props: CorpGroupBodyProps) {
  return CORP_GROUP_BODY[corpGroupState(props.corp)](props);
}

function CorpGroup({
  corp,
  corpName,
  names,
  entityNames,
  now,
}: {
  corp: CorpEntry;
  corpName: string | undefined;
  names: Record<string, string>;
  entityNames: Record<string, string>;
  now: number;
}) {
  const label = corpName ?? `Corporation #${corp.corporationId}`;
  return (
    <Card>
      <CorpGroupHeader corpId={corp.corporationId} label={label} />
      <CorpGroupBody corp={corp} corpLabel={label} names={names} entityNames={entityNames} now={now} />
    </Card>
  );
}

function CorpJobRow({
  job,
  corpId,
  corpName,
  names,
  entityNames,
  now,
}: {
  job: IndustryJob;
  corpId: number;
  corpName: string;
  names: Record<string, string>;
  entityNames: Record<string, string>;
  now: number;
}) {
  const installerId = job.installer_id;
  return (
    <JobRowFrame
      {...jobRowFrameData(job, names, now)}
      barTone="evb"
      footer={
        <div className="mt-[5px]">
          <JobRunner
            portrait={installerId !== undefined ? characterPortraitUrl(installerId, 32) : undefined}
            name={runnerName(installerId, entityNames)}
            corp={{ logo: corporationLogoUrl(corpId, 32), name: corpName }}
          />
        </div>
      }
    />
  );
}

function JobRunner({
  portrait,
  name,
  corp,
}: {
  portrait: string | undefined;
  name: string;
  corp: { logo: string; name: string };
}) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="relative shrink-0">
        <EveImage
          source="eve"
          family={portrait === undefined ? 'corporation-logo' : 'character-portrait'}
          src={portrait ?? corp.logo}
          alt=""
          width={24}
          height={24}
          className="w-6 h-6 rounded-full border border-border-soft"
        />
        {portrait !== undefined && (
          <EveImage
            source="eve"
            family="corporation-logo"
            src={corp.logo}
            alt=""
            width={14}
            height={14}
            className="absolute -bottom-1 -left-1 w-3.5 h-3.5 rounded-full border border-border-soft bg-section"
          />
        )}
      </span>
      <span className="min-w-0 truncate text-ui text-muted">
        {name} <span className="text-muted">· {corp.name}</span>
      </span>
    </span>
  );
}
