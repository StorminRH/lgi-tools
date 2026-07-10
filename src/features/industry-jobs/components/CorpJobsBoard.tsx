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
import { AccessGate } from '@/components/ui/access-gate';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SectionLabel } from '@/components/ui/section-label';
import { ENTITY_NAMES_MAX_IDS, entityNamesEndpoint } from '@/data/eve-data/api-contract';
import { apiFetch } from '@/lib/api-client';
import { characterPortraitUrl, corporationLogoUrl } from '@/lib/eve-image';
import { formatRemaining } from '@/lib/format/time';
import type { CorpJobsResponse } from '../api-contract';
import type { IndustryJob } from '../esi-projection';
import { JOB_STATUS_META, jobActivityLabel } from '../industry-jobs-styles';
import { jobProgress } from '../job-state';
import { useCorpJobsLive } from '../use-corp-jobs-live';

type CorpEntry = CorpJobsResponse['corporations'][number];

// The scope-missing gate copy, exported so the /industry dashboard coordinator
// (which composes the gate itself around the rank model) shows the same words.
export const CORP_ACCESS_REASON =
  "Reading your corporation's industry jobs needs corporation-roles and corporation-jobs access. Grant it to any linked character to see your corp jobs here.";

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

// The corp boards themselves, presentational over live data — rendered by the
// self-fetching board above (/jobs) and by the /industry dashboard coordinator
// (3.7.24), which owns its own useCorpJobsLive read + loading/empty states.
// Corp + installer names resolve here through /api/eve/names regardless of
// which surface mounts it.
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
  const ids = useMemo(() => {
    const set = new Set<number>();
    for (const corp of corporations) {
      set.add(corp.corporationId);
      for (const job of corp.data?.jobs ?? []) {
        if (job.installer_id !== undefined) set.add(job.installer_id);
      }
    }
    return [...set].sort((a, b) => a - b).slice(0, ENTITY_NAMES_MAX_IDS);
  }, [corporations]);

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
  const jobs = corp.data?.jobs ?? [];

  return (
    <Card>
      <div className="flex items-center gap-3 px-3.5 py-3 border-b border-border-soft">
        <img
          src={corporationLogoUrl(corp.corporationId, 64)}
          alt=""
          width={28}
          height={28}
          className="w-7 h-7 rounded-[3px] border border-border-soft shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-[15px] text-name truncate">{label}</div>
          <div className="text-[10px] text-muted tracking-[0.06em]">Corporation industry jobs</div>
        </div>
      </div>

      {corp.syncError === 'needs_role' ? (
        <div className="p-3.5">
          <Callout label="Role needed">
            No linked character holds the Factory Manager or Director role in this corporation, so
            its industry jobs can’t be read. Granting more access can’t fix this — an in-game role
            change is required.
          </Callout>
        </div>
      ) : corp.data === null ? (
        <div className="p-3.5">
          <Callout label="Sync trouble">
            Couldn’t read this corporation’s jobs on the last sync — the next one will retry.
          </Callout>
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState>No corporation industry jobs running.</EmptyState>
      ) : (
        jobs.map((job) => (
          <CorpJobRow
            key={job.job_id}
            job={job}
            corpId={corp.corporationId}
            corpName={label}
            names={names}
            entityNames={entityNames}
            now={now}
          />
        ))
      )}
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
  const meta = JOB_STATUS_META[job.status];
  // The product is the headline where one exists (manufacturing, invention,
  // reactions); research/copy jobs are about the blueprint itself.
  const headlineId = job.product_type_id ?? job.blueprint_type_id;
  const end = Date.parse(job.end_date);
  const installerId = job.installer_id;
  const runnerName =
    installerId !== undefined
      ? (entityNames[String(installerId)] ?? `Pilot #${installerId}`)
      : 'Unknown pilot';

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
          {job.status === 'active' && Number.isFinite(end) ? `done in ${formatRemaining(end - now)}` : ''}
        </span>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      {(job.status === 'active' || job.status === 'paused') && (
        <div className="mt-[4px]">
          <ProgressBar pct={jobProgress(job, now)} tone="evb" />
        </div>
      )}
      <div className="mt-[5px]">
        <JobRunner
          portrait={installerId !== undefined ? characterPortraitUrl(installerId, 32) : undefined}
          name={runnerName}
          corp={{ logo: corporationLogoUrl(corpId, 32), name: corpName }}
        />
      </div>
    </div>
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
        <img
          src={portrait ?? corp.logo}
          alt=""
          width={24}
          height={24}
          className="w-6 h-6 rounded-full border border-border-soft"
        />
        {portrait !== undefined && (
          <img
            src={corp.logo}
            alt=""
            title={corp.name}
            width={14}
            height={14}
            className="absolute -bottom-1 -left-1 w-3.5 h-3.5 rounded-full border border-border-soft bg-section"
          />
        )}
      </span>
      <span className="min-w-0 truncate text-[11px] text-muted">
        {name} <span className="text-muted">· {corp.name}</span>
      </span>
    </span>
  );
}
