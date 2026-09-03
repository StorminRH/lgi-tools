'use client';

import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import { formatQuantity } from '@/lib/format/number';
import { activityLabel } from '../industry-styles';
import type { BlueprintStructure } from '../types';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { CockpitKpis } from './CockpitKpis';
import { HeroCard } from './HeroCard';
import { usePlannerConfig } from './planner-contexts';
import { TemplatesMenu } from './TemplatesMenu';

function PlannerHead({
  name,
  group,
  activity,
  perRun,
  blueprintTypeId,
}: {
  name: string;
  group: string;
  activity: string;
  perRun: string;
  blueprintTypeId: number;
}) {
  return (
    <header className="grid grid-cols-1 items-end gap-x-6 gap-y-2 pt-[26px] pb-1 sm:grid-cols-[1fr_auto_1fr]">
      <div className="inline-flex items-baseline gap-5 justify-self-start text-label tracking-label text-muted">
        <span className="font-data">
          <span className="text-isk">lgi://</span>
          <Link href="/industry" className="hover:text-isk">
            industry
          </Link>

        </span>

        <TemplatesMenu blueprintTypeId={blueprintTypeId} productName={name} />
      </div>

      <h1 className="text-center font-display text-display font-bold uppercase leading-none tracking-optical text-name">
        {name}
      </h1>

      <div className="inline-flex items-center gap-[14px] justify-self-end pb-0.5 text-label uppercase tracking-label text-muted">
        {group && <span>{group}</span>}

        <Pill tone="blue">{activity}</Pill>

        <Pill tone="neutral">{perRun} per Run</Pill>

      </div>

    </header>

  );
}

export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {

  const { marginMode, setMarginMode } = usePlannerConfig();
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';

  return (
    <>
      <PlannerHead
        name={structure.product.name}
        group={group}
        activity={activityLabel(structure.activityId)}
        perRun={formatQuantity(structure.product.quantityPerRun)}
        blueprintTypeId={structure.blueprintTypeId}
      />
      <HeroCard structure={structure} />
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
      <CockpitBuildPlan structure={structure} />
    </>

  );
}
