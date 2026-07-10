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
  activeStatus,
  corpStatus,
  type DashboardSectionId,
  orderSections,
  PANEL_CLASS,
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

  const { tiles, overflow } = savedTiles(plans ?? []);
  const counts = jobCounts(jobs);

  const cells: Record<DashboardSectionId, SectionCell> = {
    recents: {
      label: 'Recents',
      body: (
        <div className={PANEL_CLASS}>
          {recent === null ? <EmptyState> </EmptyState> : <RecentBlueprintRows recent={recent} />}
        </div>
      ),
      hint: 'No blueprints viewed yet — search above and open one to start your history.',
    },
    saved: {
      label: 'Templates',
      meta:
        overflow > 0 ? (
          <Link
            href="/industry/templates"
            className="font-mono text-[10px] tracking-[0.04em] text-muted no-underline transition-colors hover:text-name"
          >
            → all templates ({(plans ?? []).length})
          </Link>
        ) : undefined,
      body: (
        <div className={PANEL_CLASS}>
          {plans === null ? <EmptyState> </EmptyState> : <SavedBuildTiles plans={tiles} />}
        </div>
      ),
      hint: savedEmptyLine({ listFailed, signedOut: !hasLinkedCharacters }),
    },
    active: {
      label: 'Active jobs',
      meta:
        jobs.length > 0 ? (
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted">
            <b className={countBadge}>{counts.complete}</b> complete ·{' '}
            <b className={countBadge}>{counts.inProgress}</b> in progress
          </span>
        ) : undefined,
      body: jobsLive.loading ? (
        <LoadingLabel label="Loading…" />
      ) : (
        <IndustryActiveJobs jobs={jobs} names={jobsLive.names} now={jobsLive.now} />
      ),
      hint:
        jobsLive.jobsByCharacter.size === 0
          ? 'Sign in with EVE (top right) to track your industry jobs here.'
          : 'No industry jobs running.',
    },
    corp: {
      label: 'Corporation industry jobs',
      body: <CorpSectionBody
        eligibleCount={corpEligibleCharacterIds.length}
        loading={corpLive.loading}
        corporations={corpLive.corporations}
        names={corpLive.names}
        now={corpLive.now}
        reconnectAction={reconnectAction}
      />,
      // Silent when there are no linked characters — the Active section's
      // sign-in hint already prompts; no double-prompt (today's null render).
      hint: hasLinkedCharacters
        ? 'No corporation industry jobs yet — they’ll appear here once a sync completes.'
        : undefined,
    },
  };

  return (
    <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-4 items-start">
      {orderSections(status).map((id) => (
        <section key={id}>
          <SectionLabel className="mb-3" meta={status[id] === 'populated' ? cells[id].meta : undefined}>
            {cells[id].label}
          </SectionLabel>
          {status[id] === 'empty' ? (
            cells[id].hint !== undefined && (
              <p className="text-[11px] text-muted">{cells[id].hint}</p>
            )
          ) : (
            cells[id].body
          )}
        </section>
      ))}
    </div>
  );
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
