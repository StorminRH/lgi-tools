'use client';

import type { BlueprintStructure } from '../types';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { PlannerRail } from './PlannerRail';

/** The blueprint and its numbers on a rail, the build beside it. */
export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
      <PlannerRail structure={structure} />
      <div className="flex min-w-0 flex-col">
        <CockpitBuildPlan structure={structure} />
      </div>
    </div>
  );
}
