'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { Stepper } from '@/components/ui/stepper';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatQuantity } from '@/lib/format/number';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import { activityLabel } from '../industry-styles';
import type { BlueprintStructure } from '../types';
import { BuildLocationSelector } from './BuildLocationSelector';
import { StructureSelector } from './StructureSelector';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { CockpitKpis, type MarginMode } from './CockpitKpis';
import { MeField, TeField } from './MeAdjuster';
import { usePricing } from './PricingProvider';

// The Cockpit planner body for /industry/[id] — the redesigned dashboard that
// replaces the legacy hero + multi-view build plan. It reads the live pricing
// store (runs, location, margin, score, rows) and lays the product economics out
// as: a page head + identity bar (here), a KPI tile row, and a consolidated tier
// build plan (with its collapsible raw-materials ledger). Built section by
// section; this file owns the page head and the identity bar.

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
  const {
    runs,
    setRuns,
    ownedMe,
    meOverrides,
    setMeOverride,
    resetMeOverride,
    ownedTe,
    teOverrides,
    setTeOverride,
    resetTeOverride,
  } = usePricing();
  // Gross/Net is the user's preference, gated by an available net estimate. Lives
  // here so the KPI margin tile reads one source of truth.
  const [marginMode, setMarginMode] = useState<MarginMode>('net');
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';
  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;
  // The main blueprint's adjusters show on any manufacturing blueprint (matching
  // the always-on per-node orbs) — empty outline when unowned, a what-if when typed;
  // reactions are excluded by `isManufacturing` since they can't be researched.
  const outputUnits = structure.product.quantityPerRun * runs;

  return (
    <>
      <PlannerHead
        name={structure.product.name}
        group={group}
        activity={activityLabel(structure.activityId)}
      />

      <div
        className={cn(
          'mb-3.5 mt-3.5 flex flex-wrap items-center gap-3.5',
          'rounded-md border border-border bg-section px-[18px] py-4',
        )}
      >
        <TypeIcon
          typeId={structure.product.typeId}
          variant="render"
          size={52}
          alt={structure.product.name}
          mono={structure.product.name.slice(0, 2)}
        />
        <div className="min-w-0">
          <div className="font-display text-[25px] font-bold uppercase leading-none tracking-[0.01em] text-name">
            {structure.product.name}
          </div>
          <div className="mt-[5px] font-body text-[11px] leading-[1.4] text-muted">
            {group ? `${group} · ` : ''}builds {formatQuantity(outputUnits)} unit
            {outputUnits === 1 ? '' : 's'}
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex flex-wrap items-center gap-4">
          {isManufacturing && (
            <div className="flex items-center gap-3 rounded-[3px] border border-border px-2.5 py-1">
              <MeField
                blueprintTypeId={structure.blueprintTypeId}
                name="main blueprint"
                ownedMe={ownedMe}
                meOverrides={meOverrides}
                setMeOverride={setMeOverride}
                resetMeOverride={resetMeOverride}
              />
              <TeField
                blueprintTypeId={structure.blueprintTypeId}
                name="main blueprint"
                ownedTe={ownedTe}
                teOverrides={teOverrides}
                setTeOverride={setTeOverride}
                resetTeOverride={resetTeOverride}
              />
            </div>
          )}
          <label className="flex items-center gap-2.5 text-[9px] uppercase tracking-[0.14em] text-muted">
            Runs
            <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" />
          </label>
          {isManufacturing && (
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted">Build at</span>
              <BuildLocationSelector blueprintId={structure.blueprintTypeId} />
            </div>
          )}
        </div>
      </div>

      {isManufacturing && (
        <div
          className={cn(
            'mb-3.5 flex flex-wrap items-center gap-3.5',
            'rounded-md border border-border bg-section px-[18px] py-3',
          )}
        >
          <span className="text-[9px] uppercase tracking-[0.14em] text-muted">Build structure</span>
          <StructureSelector />
        </div>
      )}

      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
      <CockpitBuildPlan structure={structure} />
    </>
  );
}
