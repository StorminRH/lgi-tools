'use client';

import { useSelectedLayoutSegment } from 'next/navigation';
import { useEffect } from 'react';
import { useIndustryDesk } from '@/features/industry-jobs/use-industry-desk';
import { useRecentBlueprints } from '@/features/industry-planner/use-recent-blueprints';
import { useSavedPlans } from '@/features/industry-planner/use-saved-plans';
import { useWatchlist } from '@/features/industry-planner/use-watchlist';
import { type IndustrySectionId, industrySectionFor } from './industry-sections';
import { type SummaryLine, tabSummaries } from './tab-summaries';
import { LedgerTabs } from './tabs/LedgerTabs';

export interface IndustryTabsLive {
  signedIn: boolean;
  characterIds: number[];
  corpEligibleCharacterIds: number[];
}

export interface TabStripProps {
  active: IndustrySectionId | null;
  summaries: Record<IndustrySectionId, SummaryLine[]> | null;
}

const NO_IDS: number[] = [];

function useTabSummaries(live: IndustryTabsLive, active: IndustrySectionId | null) {
  // The jobs page reads the live feeds itself; the tab doesn't read them twice.
  const onJobs = active === 'jobs';
  const desk = useIndustryDesk(
    onJobs ? NO_IDS : live.characterIds,
    onJobs ? NO_IDS : live.corpEligibleCharacterIds,
  );
  const recent = useRecentBlueprints();
  const { plans, listFailed, refresh } = useSavedPlans();
  const { watchlist } = useWatchlist();
  useEffect(() => {
    if (live.signedIn) refresh();
  }, [live.signedIn, refresh]);
  return tabSummaries({
    signedIn: live.signedIn,
    jobs: { loading: desk.jobsLive.loading, failed: desk.jobsLive.failed, list: desk.personalJobs },
    slots: desk.slots,
    recent,
    plans,
    plansFailed: listFailed,
    watchlist,
  });
}

export function IndustryTabStrip(props: TabStripProps) {
  return <LedgerTabs {...props} />;
}

/** The workspace tabs above every section, each with what it holds right now. */
export function IndustryTabs({ live }: { live: IndustryTabsLive }) {
  const active = industrySectionFor(useSelectedLayoutSegment());
  const summaries = useTabSummaries(live, active);
  return <IndustryTabStrip active={active} summaries={summaries} />;
}

/** The tabs before the session is read: the active one, without live lines. */
export function IndustryTabsShell() {
  const active = industrySectionFor(useSelectedLayoutSegment());
  return <IndustryTabStrip active={active} summaries={null} />;
}
