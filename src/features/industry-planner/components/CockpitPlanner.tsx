'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
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

// lgi://industry / <name> breadcrumb + a terse right-aligned stat strip. The
// crumb's `industry` segment links back to the planner index (replacing the old
// back link); the current product name is the bright tail. The right strip pairs
// the product's category with the job-type chip (manufacturing / reaction).
function PlannerHead({ name, group, activity }: { name: string; group: string; activity: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-[26px] pb-1">
      <div className="font-mono text-caption tracking-[0.08em] text-muted">
        <span className="text-isk">lgi://</span>
        <Link href="/industry" className="hover:text-isk">
          industry
        </Link>
        <span className="mx-1.5 text-border-active">/</span>
        <span className="text-name">{name.toLowerCase()}</span>
      </div>
      <div className="inline-flex items-center gap-[14px] pb-0.5 font-mono text-caption uppercase tracking-[0.08em] text-muted">
        {group && <span>{group}</span>}
        <Pill tone="blue">{activity}</Pill>
      </div>
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
      />
      <HeroCard structure={structure} />
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
      <CockpitBuildPlan structure={structure} />
    </>
  );
}
