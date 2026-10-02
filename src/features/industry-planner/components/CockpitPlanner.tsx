'use client';

import { useState } from 'react';
import type { BlueprintStructure } from '../types';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { PlannerRail } from './PlannerRail';

/** The blueprint and its numbers on a rail, the build beside it. */
export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  const [ledgerOpen, setLedgerOpen] = useState(false);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
      <PlannerRail structure={structure} ledgerOpen={ledgerOpen} onToggleLedger={() => setLedgerOpen((open) => !open)} />
      <div className="flex min-w-0 flex-col">
        <CockpitBuildPlan structure={structure} ledgerOpen={ledgerOpen} />
      </div>
    </div>
  );
}
