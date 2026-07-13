'use client';

// The /industry dashboard's ranked section grid (3.7.24). This coordinator —
// composition layer above the industry-planner and industry-jobs slices, which
// may not import each other — owns all four sections' data state: it calls the
// SAME hooks/reads each section used before (recents localStorage, the saved
// plans list, the personal + corp jobs on-view reads — data paths unchanged),
// derives each section's populated/empty status, and renders the sections in
// the rank model's order (dashboard-sections.ts): populated first in preferred
// order, confirmed-empty sunk to the bottom as slim headers with a one-line
// hint. Sections are keyed by id, so a reorder moves DOM nodes — the data
// lives up here and nothing refetches.
import Link from 'next/link';
import { type ReactNode, useEffect, useMemo } from 'react';
import { AccessGate } from '@/components/ui/access-gate';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingLabel } from '@/components/ui/loading-label';
import { SectionLabel } from '@/components/ui/section-label';
import { CORP_ACCESS_REASON, CorpJobsList } from '@/features/industry-jobs/components/CorpJobsBoard';
import { IndustryActiveJobs } from '@/features/industry-jobs/components/IndustryActiveJobs';
import { flattenJobs, jobCounts } from '@/features/industry-jobs/flatten-jobs';
import { useCorpJobsLive } from '@/features/industry-jobs/use-corp-jobs-live';
import { useJobsLive } from '@/features/industry-jobs/use-jobs-live';
import { RecentBlueprintRows } from '@/features/industry-planner/components/RecentBlueprintRows';
import { SavedBuildTiles } from '@/features/industry-planner/components/SavedBuildTiles';
import { savedEmptyLine, savedTiles } from '@/features/industry-planner/saved-plans-view';
import { useRecentBlueprints } from '@/features/industry-planner/use-recent-blueprints';
import { useSavedPlans } from '@/features/industry-planner/use-saved-plans';
import {
  activeJobsHint,
  activeStatus,
  corpHint,
  corpStatus,
  type DashboardSectionId,
  deriveSectionRender,
  orderSections,
  recentsStatus,
  savedStatus,
  type SectionStatus,
} from './dashboard-sections';

interface SectionCell {
  label: string;
  meta?: ReactNode;
  // Rendered under the label when populated/pending; empty sections render
  // `hint` (or nothing) instead — the sunk slim-header form.
  body: ReactNode;
  hint?: string;
}

const countBadge = 'text-evb-bright font-semibold';

// One section: its label + meta, then either the sunk one-line hint (confirmed
// empty) or the body. The populated/empty/hint decision is `deriveSectionRender`.
function DashboardSection({ status, cell }: { status: SectionStatus; cell: SectionCell }) {
  const render = deriveSectionRender(status, cell.hint);
  return (
    <section>
      <SectionLabel className="mb-3" meta={render.meta ? cell.meta : undefined}>
        {cell.label}
      </SectionLabel>
      {render.hint !== null && <p className="text-ui text-muted">{render.hint}</p>}
      {render.body && cell.body}
    </section>
  );
}

function RecentsPanel({ recent }: { recent: ReturnType<typeof useRecentBlueprints> }) {
  return (
    <Card className="overflow-hidden">
      {recent === null ? <EmptyState> </EmptyState> : <RecentBlueprintRows recent={recent} />}
    </Card>
  );
}

function TemplatesPanel({
  plans,
  tiles,
}: {
  plans: ReturnType<typeof useSavedPlans>['plans'];
  tiles: ReturnType<typeof savedTiles>['tiles'];
}) {
  return (
    <Card className="overflow-hidden">
      {plans === null ? <EmptyState> </EmptyState> : <SavedBuildTiles plans={tiles} />}
    </Card>
  );
}

function ActiveJobsPanel({
  loading,
  jobs,
  names,
  now,
}: {
  loading: boolean;
  jobs: ReturnType<typeof flattenJobs>;
  names: Record<string, string>;
  now: number;
}) {
  if (loading) return <LoadingLabel label="Loading…" />;
  return <IndustryActiveJobs jobs={jobs} names={names} now={now} />;
}

// The corp cell's populated/pending body: the scope-missing AccessGate (an
// actionable relink CTA — ranked populated so it never sinks), the loading
// label, or the corp boards over the coordinator's own live read.
function CorpSectionBody({
  eligibleCount,
  loading,
  corporations,
  names,
  now,
  reconnectAction,
}: {
  eligibleCount: number;
  loading: boolean;
  corporations: Parameters<typeof CorpJobsList>[0]['corporations'];
  names: Record<string, string>;
  now: number;
  reconnectAction: ReactNode;
}) {
  if (eligibleCount === 0) {
    return (
      <AccessGate blocked reason={CORP_ACCESS_REASON} action={reconnectAction}>
        {null}
      </AccessGate>
    );
  }
  if (loading) return <LoadingLabel label="Loading…" />;
  return <CorpJobsList corporations={corporations} names={names} now={now} />;
}

export function IndustryDashboardGrid({
  characterIds,
  corpEligibleCharacterIds,
  hasLinkedCharacters,
  reconnectAction,
}: {
  characterIds: number[];
  corpEligibleCharacterIds: number[];
  hasLinkedCharacters: boolean;
  reconnectAction: ReactNode;
}) {
  const recent = useRecentBlueprints();
  const { plans, listFailed, refresh } = useSavedPlans();
  const jobsLive = useJobsLive(characterIds);
  const corpLive = useCorpJobsLive(corpEligibleCharacterIds);

  // One list fetch on mount (the popover consumer fetches on open instead).
  useEffect(() => {
    refresh();
  }, [refresh]);

  const jobs = useMemo(
    () => flattenJobs(jobsLive.jobsByCharacter.values()),
    [jobsLive.jobsByCharacter],
  );

  const status: Record<DashboardSectionId, SectionStatus> = {
    recents: recentsStatus(recent),
    saved: savedStatus(plans, listFailed),
    active: activeStatus({
      loading: jobsLive.loading,
      rosterSize: jobsLive.jobsByCharacter.size,
      jobCount: jobs.length,
    }),
    corp: corpStatus({
      hasLinkedCharacters,
      eligibleCount: corpEligibleCharacterIds.length,
      loading: corpLive.loading,
      corpCount: corpLive.corporations.length,
    }),
  };

  const allPlans = plans ?? [];
  const { tiles, overflow } = savedTiles(allPlans);
  const counts = jobCounts(jobs);

  const savedMeta =
    overflow > 0 ? (
      <Link
        href="/industry/templates"
        className="font-mono text-micro tracking-copy text-muted no-underline transition-colors hover:text-name"
      >
        → all templates ({allPlans.length})
      </Link>
    ) : undefined;

  const activeMeta =
    jobs.length > 0 ? (
      <span className="font-mono text-label tracking-label uppercase text-muted">
        <b className={countBadge}>{counts.complete}</b> complete ·{' '}
        <b className={countBadge}>{counts.inProgress}</b> in progress
      </span>
    ) : undefined;

  const cells: Record<DashboardSectionId, SectionCell> = {
    recents: {
      label: 'Recents',
      body: <RecentsPanel recent={recent} />,
      hint: 'No blueprints viewed yet — search above and open one to start your history.',
    },
    saved: {
      label: 'Templates',
      meta: savedMeta,
      body: <TemplatesPanel plans={plans} tiles={tiles} />,
      hint: savedEmptyLine({ listFailed, signedOut: !hasLinkedCharacters }),
    },
    active: {
      label: 'Active jobs',
      meta: activeMeta,
      body: (
        <ActiveJobsPanel
          loading={jobsLive.loading}
          jobs={jobs}
          names={jobsLive.names}
          now={jobsLive.now}
        />
      ),
      hint: activeJobsHint(jobsLive.jobsByCharacter.size),
    },
    corp: {
      label: 'Corporation industry jobs',
      body: (
        <CorpSectionBody
          eligibleCount={corpEligibleCharacterIds.length}
          loading={corpLive.loading}
          corporations={corpLive.corporations}
          names={corpLive.names}
          now={corpLive.now}
          reconnectAction={reconnectAction}
        />
      ),
      hint: corpHint(hasLinkedCharacters),
    },
  };

  return (
    <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-4 items-start">
      {orderSections(status).map((id) => (
        <DashboardSection key={id} status={status[id]} cell={cells[id]} />
      ))}
    </div>
  );
}
