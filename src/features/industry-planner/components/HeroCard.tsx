'use client';

import type { ReactNode } from 'react';
import { RunAsFrame } from '@/components/RunAsFrame';
import { cn } from '@/components/ui/cn';
import { Stepper } from '@/components/ui/stepper';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatQuantity } from '@/lib/format/number';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import type { BlueprintStructure } from '../types';
import { BuildLocationSelector } from './BuildLocationSelector';
import { MeField, TeField } from './MeAdjuster';
import { usePricing } from './PricingProvider';

// One stacked stepper row: a mono label + its control. Shared by ME, TE and Runs
// so the three read as a single vertical group (the hero-card mockup).
function StepperRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      {children}
    </div>
  );
}

// ME / TE / Runs stacked vertically. ME/TE render WITH the ▲/▼ stepper affordance
// (the existing `steppers` prop — no effect on any computed ME/TE/cost value); Runs
// keeps its numeric stepper. ME/TE are manufacturing-only (a reaction can't be
// researched), matching the always-on per-node adjusters.
function HeroSteppers({
  blueprintTypeId,
  isManufacturing,
}: {
  blueprintTypeId: number;
  isManufacturing: boolean;
}) {
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
  return (
    <div className="flex flex-col justify-center gap-2">
      {isManufacturing && (
        <StepperRow label="ME">
          <MeField
            blueprintTypeId={blueprintTypeId}
            name="main blueprint"
            ownedMe={ownedMe}
            meOverrides={meOverrides}
            setMeOverride={setMeOverride}
            resetMeOverride={resetMeOverride}
            steppers
          />
        </StepperRow>
      )}
      {isManufacturing && (
        <StepperRow label="TE">
          <TeField
            blueprintTypeId={blueprintTypeId}
            name="main blueprint"
            ownedTe={ownedTe}
            teOverrides={teOverrides}
            setTeOverride={setTeOverride}
            resetTeOverride={resetTeOverride}
            steppers
          />
        </StepperRow>
      )}
      <StepperRow label="Runs">
        <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" />
      </StepperRow>
    </div>
  );
}

// The reserved-but-inert second build-location row (System + Refinery). It holds the
// layout slot for the next session's refinery bonus source (reaction nodes routed to
// a second structure); it renders disabled with no wiring and no bonus. Deliberately
// NOT a copy of BuildFacilitySelect's markup — just placeholder chrome.
function RefineryRowStub() {
  return (
    <div className="flex flex-col gap-2 opacity-55" aria-hidden>
      <div className="flex items-center gap-2">
        <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">
          System
        </span>
        <span className="flex-1 border border-border-idle bg-bg px-2 py-1 font-mono text-[11px] text-faint">
          —
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">
          Refinery
        </span>
        <span className="flex-1 border border-border-idle bg-bg px-2 py-1 font-mono text-[11px] text-faint">
          — next session
        </span>
      </div>
    </div>
  );
}

// The consolidated hero card: a single horizontal band — blueprint icon, the item
// identity, the stacked ME/TE/Runs steppers, the Run-As building-character frame, and
// the two-group location area (the live System+Structure selector plus the reserved
// System+Refinery slot). Clusters are self-contained flex children so the band wraps
// cleanly on narrow viewports.
export function HeroCard({ structure }: { structure: BlueprintStructure }) {
  const { runs } = usePricing();
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';
  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;
  const outputUnits = structure.product.quantityPerRun * runs;

  return (
    <div
      className={cn(
        'mb-3.5 mt-3.5 flex flex-wrap items-stretch gap-3.5',
        'rounded-md border border-border bg-section px-[18px] py-4',
      )}
    >
      <TypeIcon
        typeId={structure.product.typeId}
        variant="render"
        size={52}
        alt={structure.product.name}
        mono={structure.product.name.slice(0, 2)}
        className="self-center"
      />
      <div className="min-w-0 self-center">
        <div className="font-display text-[25px] font-bold uppercase leading-none tracking-[0.01em] text-name">
          {structure.product.name}
        </div>
        <div className="mt-[5px] font-body text-[11px] leading-[1.4] text-muted">
          {group ? `${group} · ` : ''}builds {formatQuantity(outputUnits)} unit
          {outputUnits === 1 ? '' : 's'}
        </div>
      </div>

      <HeroSteppers blueprintTypeId={structure.blueprintTypeId} isManufacturing={isManufacturing} />

      <RunAsFrame />

      {isManufacturing && (
        <div className="flex flex-col justify-center gap-2 sm:ml-auto">
          <BuildLocationSelector blueprintId={structure.blueprintTypeId} />
          <RefineryRowStub />
        </div>
      )}
    </div>
  );
}
