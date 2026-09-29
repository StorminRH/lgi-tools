'use client';

import { useEffect } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionPanel } from '@/components/ui/readout';
import { SheetHeading, SheetLayout } from '@/components/ui/sheet-layout';
import { useAccountCharacters } from '@/components/use-account-characters';
import type { RecentBlueprint } from '../recent-blueprints';
import { savedPlansViewState } from '../saved-plans-view';
import { useRecentBlueprints } from '../use-recent-blueprints';
import { useSavedPlans } from '../use-saved-plans';
import { useWatchlist } from '../use-watchlist';
import { BlueprintSearchPanel } from './BlueprintSearch';
import { RecentBlueprintRows } from './RecentBlueprintRows';
import { SavedBuildTiles } from './SavedBuildTiles';

function BlueprintList({ entries, empty }: { entries: RecentBlueprint[] | null; empty: string }) {
  if (entries === null) return <EmptyState> </EmptyState>;
  if (entries.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <RecentBlueprintRows recent={entries} />;
}

/** Where a job plan starts when no blueprint is open: search, or pick up something already begun. */
export function PlanLanding() {
  const recent = useRecentBlueprints();
  const { watchlist } = useWatchlist();
  const roster = useAccountCharacters();
  const { plans, listFailed, refresh } = useSavedPlans();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const templates = savedPlansViewState(plans, roster, listFailed);

  return (
    <SheetLayout
      aside={
        <>
          <SheetHeading title="Job plan">
            Pick a blueprint or reaction to plan its build: input cost, margin, build time and the full material tree.
          </SheetHeading>
          <BlueprintSearchPanel label="Start a plan" />
        </>
      }
    >
      <SectionPanel title="Continue planning">
        <BlueprintList entries={recent} empty="No recent plans yet. Search for a blueprint to start one." />
      </SectionPanel>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SectionPanel title="From a template">
          {templates.kind === 'list' ? (
            <SavedBuildTiles plans={plans ?? []} />
          ) : (
            <EmptyState>{templates.kind === 'empty' ? templates.line : ' '}</EmptyState>
          )}
        </SectionPanel>
        <SectionPanel title="Watched products">
          <BlueprintList entries={watchlist} empty="Nothing watched yet." />
        </SectionPanel>
      </div>
    </SheetLayout>
  );
}
