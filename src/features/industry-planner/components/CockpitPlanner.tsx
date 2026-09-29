'use client';

import { SheetLayout } from '@/components/ui/sheet-layout';
import type { BlueprintStructure } from '../types';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { CockpitKpis } from './CockpitKpis';
import { PlanSetup } from './PlanSetup';
import { usePlannerConfig } from './planner-contexts';

/**
 * A job plan as a sheet: the setup — what, who, how many, where — in the
 * context column, and what it costs, earns and takes beside it.
 */
export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  const { marginMode, setMarginMode } = usePlannerConfig();
  return (
    <SheetLayout aside={<PlanSetup structure={structure} />}>
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
      <CockpitBuildPlan structure={structure} />
    </SheetLayout>
  );
}
