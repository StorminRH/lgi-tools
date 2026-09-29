'use client';

import Link from 'next/link';
import { type ReactNode, useEffect } from 'react';
import { EveSignInButton } from '@/components/composition/account/LoginButton';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionPanel, StatFigure } from '@/components/ui/readout';
import { Skeleton } from '@/components/ui/skeleton';
import { IndustryActiveJobs } from '@/features/industry-jobs/components/IndustryActiveJobs';
import { jobCounts } from '@/features/industry-jobs/flatten-jobs';
import { JOBS_LOAD_FAILED } from '@/features/industry-jobs/job-view';
import { slotTotal } from '@/features/industry-jobs/slots';
import { type IndustryDesk, useIndustryDesk } from '@/features/industry-jobs/use-industry-desk';
import type { SavedPlanRow } from '@/features/industry-planner/api-contract';
import { BlueprintSearch } from '@/features/industry-planner/components/BlueprintSearch';
import { RecentBlueprintRows } from '@/features/industry-planner/components/RecentBlueprintRows';
import { SavedBuildTiles } from '@/features/industry-planner/components/SavedBuildTiles';
import type { RecentBlueprint } from '@/features/industry-planner/recent-blueprints';
import { savedEmptyLine, savedTiles } from '@/features/industry-planner/saved-plans-view';
import { useRecentBlueprints } from '@/features/industry-planner/use-recent-blueprints';
import { useSavedPlans } from '@/features/industry-planner/use-saved-plans';
import { useWatchlist } from '@/features/industry-planner/use-watchlist';
import { IndustryRail } from './IndustryRail';
import { railSummaries } from './overview-model';

const OVERVIEW_JOBS = 6;
const OVERVIEW_ROWS = 5;

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="whitespace-nowrap normal-case tracking-normal text-isk no-underline hover:text-name">
      {children}
    </Link>
  );
}

/**
 * The workspace's front page, laid out like the home board: the sections on
 * a rail with what each holds right now, and beside them what needs doing —
 * jobs to deliver, plans to pick up, templates to reuse.
 */
export function IndustryOverview({
  characterIds,
  corpEligibleCharacterIds,
  signedIn,
}: {
  characterIds: number[];
  corpEligibleCharacterIds: number[];
  signedIn: boolean;
}) {
  const desk = useIndustryDesk(characterIds, corpEligibleCharacterIds);
  const recent = useRecentBlueprints();
  const { plans, listFailed, refresh } = useSavedPlans();
  const { watchlist } = useWatchlist();

  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  const summaries = railSummaries({
    signedIn,
    jobs: { loading: desk.jobsLive.loading, failed: desk.jobsLive.failed, list: desk.personalJobs },
    slots: desk.slots,
    recent,
    plans,
    plansFailed: listFailed,
    watchlist,
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10">
      <div className="reveal reveal-1 min-w-0">
        <IndustryRail summaries={summaries} />
      </div>
      <div role="region" aria-label="Industry overview" className="reveal reveal-2 flex min-w-0 flex-col gap-4">
        <JobsCard signedIn={signedIn} desk={desk} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <SectionPanel title="Job plans" meta={<MoreLink href="/industry/plan">Plan a build →</MoreLink>}>
            <div className="border-b border-border-soft px-3.5 py-3">
              <BlueprintSearch />
            </div>
            <RecentPlans recent={recent} />
          </SectionPanel>
          <SectionPanel title="Templates" meta={<MoreLink href="/industry/templates">All templates →</MoreLink>}>
            <TemplateTiles signedIn={signedIn} plans={plans} listFailed={listFailed} />
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

function RecentPlans({ recent }: { recent: RecentBlueprint[] | null }) {
  if (recent === null) return <EmptyState> </EmptyState>;
  if (recent.length === 0) return <EmptyState>No recent plans yet.</EmptyState>;
  return <RecentBlueprintRows recent={recent.slice(0, OVERVIEW_ROWS)} />;
}

function TemplateTiles({
  signedIn,
  plans,
  listFailed,
}: {
  signedIn: boolean;
  plans: SavedPlanRow[] | null;
  listFailed: boolean;
}) {
  if (signedIn && plans !== null && plans.length > 0) {
    return <SavedBuildTiles plans={savedTiles(plans, OVERVIEW_ROWS).tiles} />;
  }
  const settling = signedIn && plans === null && !listFailed;
  return <EmptyState>{settling ? ' ' : savedEmptyLine({ listFailed, signedOut: !signedIn })}</EmptyState>;
}

function JobsCard({ signedIn, desk }: { signedIn: boolean; desk: IndustryDesk }) {
  const meta = <MoreLink href="/industry/jobs">All jobs →</MoreLink>;
  return (
    <SectionPanel title="Industry jobs" meta={meta}>
      {signedIn ? (
        <JobsBody desk={desk} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
          <p className="text-ui text-muted">Sign in with EVE to follow your jobs and slots live.</p>
          <EveSignInButton callbackURL="/industry" />
        </div>
      )}
    </SectionPanel>
  );
}

function JobsBody({ desk }: { desk: IndustryDesk }) {
  const { jobsLive, personalJobs, slots } = desk;
  if (jobsLive.loading) {
    return (
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <Skeleton label="Loading jobs" className="h-6 w-2/5" />
        <Skeleton aria-hidden className="h-3 w-3/5" />
      </div>
    );
  }
  const counts = jobCounts(personalJobs);
  const total = slots === null ? null : slotTotal(slots);
  return (
    <>
      <dl className="grid grid-cols-3 gap-x-8 px-3.5 py-3 sm:max-w-md">
        <StatFigure label="Ready" value={counts.complete} tone={counts.complete > 0 ? 'text-isk' : 'text-name'} />
        <StatFigure label="Running" value={counts.inProgress} />
        <StatFigure label="Slots" value={total === null ? '—' : `${total.used}/${total.total}`} />
      </dl>
      <JobsList desk={desk} />
    </>
  );
}

function JobsList({ desk }: { desk: IndustryDesk }) {
  const { jobsLive, personalJobs } = desk;
  if (jobsLive.failed) return <EmptyState>{JOBS_LOAD_FAILED}</EmptyState>;
  if (personalJobs.length === 0) return <EmptyState>No industry jobs running.</EmptyState>;
  return (
    <div className="overflow-x-auto border-t border-border-soft">
      <IndustryActiveJobs jobs={personalJobs.slice(0, OVERVIEW_JOBS)} names={jobsLive.names} now={jobsLive.now} />
    </div>
  );
}
