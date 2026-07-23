'use client';

// The corp industry-jobs section — the consumer surface for the corp dataset, now read
// from Neon (MIGRATE.B.3) instead of the live Convex engine. Rendered beneath the
// personal jobs on both the /jobs board and the /industry landing's Active-jobs section.
// Each corp job is attributed to its installer (portrait + name) with the corporation's
// logo as a badge; corp + installer names resolve client-side through /api/eve/names
// (names live neither in Neon nor the SDE), while blueprint/product names ride the
// on-view response. Data policy: auto-refresh on view (the stale-gated write-behind), no
// manual refresh control; a completing job flips to ready CLIENT-SIDE at its end_date
// (deriveJobStatus on the render clock — no scheduler).
//
// Two gates, computed app-side and passed in:
//  - scope-missing (no linked character can vend a corp read) → an AccessGate invite to
//    relink and grant the corp scopes.
//  - role-insufficient (`needs_role`) → a distinct notice: granting more access can't fix
//    an in-game role.
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { EveImage } from '@/components/eve-image';
import { AccessGate } from '@/components/ui/access-gate';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { SectionLabel } from '@/components/ui/section-label';
import { ENTITY_NAMES_MAX_IDS, entityNamesEndpoint } from '@/data/eve-data/api-contract';
import { apiFetch } from '@/transport/api-client';
import { characterPortraitUrl, corporationLogoUrl } from '@/lib/eve-image';
import type { CorpJobsResponse } from '../api-contract';
import type { IndustryJob } from '../esi-projection';
import { corpEntityIds, corpGroupState, jobRowFrameData, runnerName } from '../job-view';
import { useCorpJobsLive } from '../use-corp-jobs-live';
import { JobRowFrame } from './JobRowFrame';

type CorpEntry = CorpJobsResponse['corporations'][number];

/**
 * The scope-missing gate copy, exported so the /industry dashboard coordinator
 * (which composes the gate itself around the rank model) shows the same words.
 */
export const CORP_ACCESS_REASON =
  "Reading your corporation's industry jobs needs corporation-roles and corporation-jobs access. Grant it to any linked character to see your corp jobs here.";

/** Renders corporation industry jobs grouped by owner with access, loading, empty, and refresh states. */
export function CorpJobsBoard({
  eligibleCharacterIds,
  hasLinkedCharacters,
  reconnectAction,
}: {
  eligibleCharacterIds: number[];
  hasLinkedCharacters: boolean;
  // The relink control, composed by the page (a feature can't import the auth
  // button directly), shown inside the scope-missing AccessGate.
  reconnectAction: ReactNode;
}) {
  // No linked characters at all → the personal board already prompts "link a
  // character"; the corp section stays silent rather than double-prompting.
  if (!hasLinkedCharacters) return null;

  return (
    <section>
      <SectionLabel className="mb-3">Corporation industry jobs</SectionLabel>
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

/**
 * The corp boards themselves, presentational over live data — rendered by the
 * self-fetching board above (/jobs) and by the /industry dashboard coordinator
 * (3.7.24), which owns its own useCorpJobsLive read + loading/empty states.
 * Corp + installer names resolve here through /api/eve/names regardless of
 * which surface mounts it.
 */
export function CorpJobsList({
  corporations,
  names,
  now,
}: {
  corporations: CorpEntry[];
  names: Record<string, string>;
  now: number;
}) {
  const entityNames = useEntityNames(corporations);
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

// Resolve the corporation + installer ids in the live corp data to names through
// /api/eve/names. Re-fetches only when the id set changes (keyed on content);
// unresolved ids are simply absent (the row falls back to a generic label).
function useEntityNames(corporations: CorpEntry[]): Record<string, string> {
  const ids = useMemo(() => corpEntityIds(corporations, ENTITY_NAMES_MAX_IDS), [corporations]);

  const [names, setNames] = useState<Record<string, string>>({});
  const idsKey = ids.join(',');
  useEffect(() => {
    if (idsKey === '') return;
    let cancelled = false;
    void apiFetch(entityNamesEndpoint, { body: { ids: idsKey.split(',').map(Number) } }).then(
      (result) => {
        if (!cancelled && result.ok) setNames((prev) => ({ ...prev, ...result.data.names }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  return names;
}

interface CorpGroupBodyProps {
  corp: CorpEntry;
  corpLabel: string;
  names: Record<string, string>;
  entityNames: Record<string, string>;
  now: number;
}

// The corp header (logo + name), and one notice card for the two gate states.
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
        <div className="text-label text-muted tracking-ui">Corporation industry jobs</div>
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

// The four render states of a corp group, keyed by its discriminant (config over a
// branch ladder — keeps CorpGroup / CorpGroupBody trivial).
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

// Per-job runner attribution: the installer's portrait with the corporation's
// logo as a small badge (bottom-left), then the runner + corp name. When the
// installer id is absent (a legacy doc), the corp logo stands in as the avatar
// with no badge.
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
            title={corp.name}
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
