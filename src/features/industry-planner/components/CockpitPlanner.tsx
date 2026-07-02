'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import { formatQuantity } from '@/lib/format/number';
import { activityLabel } from '../industry-styles';
import type { BlueprintStructure } from '../types';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { CockpitKpis, type MarginMode } from './CockpitKpis';
import { HeroCard } from './HeroCard';

// The Cockpit planner body for /industry/[id] — the redesigned dashboard that
// replaces the legacy hero + multi-view build plan. It lays the product economics
// out as: a page head (here), the consolidated hero card (identity + steppers +
// building-character frame + build-location area), a KPI tile row, and a
// consolidated tier build plan (with its collapsible raw-materials ledger). This
// file owns the page head and composes the sections below it.

// The lgi://industry breadcrumb + a terse right-aligned stat strip, with the
// item's name CENTERED beneath them, over the hero card (the card itself
// carries no title). The crumb's `industry` segment links back to the planner
// index; the right strip pairs the product's category with the job-type chip
// and the per-run output chip.
function PlannerHead({
  name,
  group,
  activity,
  perRun,
}: {
  name: string;
  group: string;
  activity: string;
  perRun: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-[26px] pb-1">
      <div className="font-mono text-caption tracking-[0.08em] text-muted">
        <span className="text-isk">lgi://</span>
        <Link href="/industry" className="hover:text-isk">
          industry
        </Link>
      </div>
      <div className="inline-flex items-center gap-[14px] pb-0.5 font-mono text-caption uppercase tracking-[0.08em] text-muted">
        {group && <span>{group}</span>}
        <Pill tone="blue">{activity}</Pill>
        <Pill tone="neutral">{perRun} per Run</Pill>
      </div>
      <h1 className="basis-full text-center font-display text-[25px] font-bold uppercase leading-none tracking-[0.01em] text-name">
        {name}
      </h1>
    </header>
  );
}

export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  // Gross/Net is the user's preference, gated by an available net estimate. Lives
  // here so the KPI margin tile reads one source of truth.
  const [marginMode, setMarginMode] = useState<MarginMode>('net');
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';

  return (
    <>
      <PlannerHead
        name={structure.product.name}
        group={group}
        activity={activityLabel(structure.activityId)}
        perRun={formatQuantity(structure.product.quantityPerRun)}
      />
      <HeroCard structure={structure} />
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
      <CockpitBuildPlan structure={structure} />
    </>
  );
}
