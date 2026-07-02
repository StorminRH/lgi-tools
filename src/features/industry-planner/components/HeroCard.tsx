'use client';

import type { ReactNode } from 'react';
import { RunAsFrame } from '@/components/RunAsFrame';
import { cn } from '@/components/ui/cn';
import { Stepper } from '@/components/ui/stepper';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatQuantity } from '@/lib/format/number';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import { nodeMeState } from '../me-overrides';
import { nodeTeState } from '../te-overrides';
import type { BlueprintStructure } from '../types';
import { BuildLocationSelector } from './BuildLocationSelector';
import { GemIcon, HourglassIcon, MeField, TeField } from './MeAdjuster';
import { usePricing } from './PricingProvider';
import { ReactionStructureSelect } from './ReactionStructureSelect';

// One stacked stepper row: a mono label (with the row's gem/hourglass glyph
// directly after it) + its control. Shared by ME, TE and Runs so the three read
// as a single vertical group of identical boxed controls.
function StepperRow({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
        {icon && (
          <span aria-hidden className="inline-flex h-3 w-3 shrink-0">
            {icon}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

// ME / TE / Runs stacked vertically, all three in the SAME boxed −/[value]/+
// control (the Runs Stepper's look — the hero rework's one-control-family rule;
// no effect on any computed ME/TE/cost value). The gem/hourglass live beside the
// ME/TE labels, toned by the blueprint's owned/manual state. ME/TE are
// manufacturing-only (a reaction can't be researched), matching the always-on
// per-node adjusters.
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
  const meState = nodeMeState(ownedMe?.get(blueprintTypeId), meOverrides.get(blueprintTypeId));
  const teState = nodeTeState(ownedTe?.get(blueprintTypeId), teOverrides.get(blueprintTypeId));
  return (
    <div className="flex flex-col justify-center gap-2">
      {isManufacturing && (
        <StepperRow label="ME" icon={<GemIcon state={meState} />}>
          <MeField
            blueprintTypeId={blueprintTypeId}
            name="main blueprint"
            ownedMe={ownedMe}
            meOverrides={meOverrides}
            setMeOverride={setMeOverride}
            resetMeOverride={resetMeOverride}
            boxed
          />
        </StepperRow>
      )}
      {isManufacturing && (
        <StepperRow label="TE" icon={<HourglassIcon state={teState} />}>
          <TeField
            blueprintTypeId={blueprintTypeId}
            name="main blueprint"
            ownedTe={ownedTe}
            teOverrides={teOverrides}
            setTeOverride={setTeOverride}
            resetTeOverride={resetTeOverride}
            boxed
          />
        </StepperRow>
      )}
      <StepperRow label="Runs">
        <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" />
      </StepperRow>
    </div>
  );
}

// The consolidated hero card: the item identity (name + type) as a compact title
// row, over ONE equal-height plane of elements — the item render in a square
// frame (the building-character frame's exact twin), the stacked ME/TE/Runs boxed
// steppers, the square Run-As frame, and the two location groups side by side
// (Manufacturing, then Reactions; each a fixed-size System search over a Station
// select, bonus readout beside the header). Every cluster centers on the same
// 108px plane so nothing shifts as picks land; the band wraps cleanly on narrow
// viewports.
export function HeroCard({ structure }: { structure: BlueprintStructure }) {
  const { runs } = usePricing();
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';
  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;
  const outputUnits = structure.product.quantityPerRun * runs;

  return (
    <div
      className={cn(
        'mb-3.5 mt-3.5 flex flex-col gap-3',
        'rounded-md border border-border bg-section px-[18px] py-4',
      )}
    >
      <div className="min-w-0">
        <div className="font-display text-[25px] font-bold uppercase leading-none tracking-[0.01em] text-name">
          {structure.product.name}
        </div>
        <div className="mt-[5px] font-body text-[11px] leading-[1.4] text-muted">
          {group ? `${group} · ` : ''}builds {formatQuantity(outputUnits)} unit
          {outputUnits === 1 ? '' : 's'}
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-x-6 gap-y-3">
        {/* The item render in the building-character frame's exact twin, so the
            two squares bracket the steppers on one plane. */}
        <div className="flex aspect-square w-[108px] shrink-0 items-center justify-center rounded-[3px] border border-border p-2">
          <TypeIcon
            typeId={structure.product.typeId}
            variant="render"
            size={88}
            alt={structure.product.name}
            mono={structure.product.name.slice(0, 2)}
          />
        </div>

        <HeroSteppers blueprintTypeId={structure.blueprintTypeId} isManufacturing={isManufacturing} />

        {/* The building character. The gap between this frame and the location
            groups is the RESERVED seam for the future Run-As skills/standings
            modification icons (ACCOUNT.8) — don't crowd it. */}
        <RunAsFrame />

        {/* The two location groups side by side, always shown (a reaction root
            builds in a refinery too). The routing derives roles — a lone
            refinery does everything; adding a build structure takes over just
            the manufacturing nodes. */}
        <div className="flex flex-wrap gap-x-6 gap-y-3 sm:ml-auto">
          <BuildLocationSelector blueprintId={structure.blueprintTypeId} />
          <ReactionStructureSelect />
        </div>
      </div>
    </div>
  );
}
