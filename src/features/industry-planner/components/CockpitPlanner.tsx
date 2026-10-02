'use client';

import { addTransitionType, startTransition, useState, ViewTransition } from 'react';
import type { BlueprintStructure } from '../types';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { CockpitRawLedger } from './CockpitRawLedger';
import { ComponentDrawer } from './ComponentDrawer';
import { useMarketData } from './planner-contexts';
import { PlannerRail } from './PlannerRail';

type BodyView = 'build' | 'ledger';

/** The build and its raw ledger trade places the way the workspace's tabs do. */
const VIEW_MOTION = { 'planner-view': 'industry-section', default: 'none' };

function RawLedgerView({ structure }: { structure: BlueprintStructure }) {
  const { pricing, refreshing } = useMarketData();
  return <CockpitRawLedger pricing={pricing} structure={structure} refreshing={refreshing} />;
}

/** The blueprint and its numbers on a rail; beside it the build, or its raw ledger. */
export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  const [view, setView] = useState<BodyView>('build');
  // The component jobs opened in the drawer, the shown one last.
  const [drawer, setDrawer] = useState<number[]>([]);
  const toggleLedger = () =>
    startTransition(() => {
      addTransitionType('planner-view');
      setView((shown) => (shown === 'ledger' ? 'build' : 'ledger'));
    });
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
      <PlannerRail structure={structure} ledgerShown={view === 'ledger'} onToggleLedger={toggleLedger} />
      <div className="flex min-w-0 flex-col">
        {view === 'ledger' ? (
          <ViewTransition key="ledger" enter={VIEW_MOTION} exit={VIEW_MOTION} default="none">
            <div>
              <RawLedgerView structure={structure} />
            </div>
          </ViewTransition>
        ) : (
          <ViewTransition key="build" enter={VIEW_MOTION} exit={VIEW_MOTION} default="none">
            <div>
              <CockpitBuildPlan structure={structure} onOpen={(typeId) => setDrawer([typeId])} />
            </div>
          </ViewTransition>
        )}
      </div>
      <ComponentDrawer structure={structure} stack={drawer} onStackChange={setDrawer} />
    </div>
  );
}
