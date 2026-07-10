'use client';

import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import { formatQuantity } from '@/lib/format/number';
import { activityLabel } from '../industry-styles';
import type { BlueprintStructure } from '../types';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { CockpitKpis } from './CockpitKpis';
import { HeroCard } from './HeroCard';
import { usePricing } from './PricingProvider';

// The Cockpit planner body for /industry/[id] — the redesigned dashboard that
// replaces the legacy hero + multi-view build plan. It lays the product economics
// out as: a page head (here), the consolidated hero card (identity + steppers +
// building-character frame + build-location area), a KPI tile row, and a
// consolidated tier build plan (with its collapsible raw-materials ledger). This
// file owns the page head and composes the sections below it.

// The page head, ONE bottom-aligned line resting on the hero card: the
// lgi://industry breadcrumb left, the item's name CENTERED (the card itself
// carries no title), and the terse stat strip right — the product's category,
// the job-type chip, and the per-run output chip. The 1fr/auto/1fr grid keeps
// the name on the true page center regardless of the side content's widths;
// on narrow viewports the three stack instead.
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
    <header className="grid grid-cols-1 items-end gap-x-6 gap-y-2 pt-[26px] pb-1 sm:grid-cols-[1fr_auto_1fr]">
      <div className="justify-self-start font-mono text-caption tracking-[0.08em] text-muted">
        <span className="text-isk">lgi://</span>
        <Link href="/industry" className="hover:text-isk">
          industry
        </Link>
      </div>
      <h1 className="text-center font-display text-[25px] font-bold uppercase leading-none tracking-[0.01em] text-name">
        {name}
      </h1>
      <div className="inline-flex items-center gap-[14px] justify-self-end pb-0.5 font-mono text-caption uppercase tracking-[0.08em] text-muted">
        {group && <span>{group}</span>}
        <Pill tone="blue">{activity}</Pill>
        <Pill tone="neutral">{perRun} per Run</Pill>
      </div>
    </header>
  );
}

export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  // Gross/Net is the user's preference, gated by an available net estimate.
  // Provider-owned since 3.7.23.1 (template state); the KPI margin tile still
  // reads the one source through these props.
  const { marginMode, setMarginMode } = usePricing();
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
