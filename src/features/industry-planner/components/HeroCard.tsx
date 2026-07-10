'use client';

import type { ReactNode } from 'react';
import { RunAsFrame } from '@/components/RunAsFrame';
import { cn } from '@/components/ui/cn';
import { Stepper } from '@/components/ui/stepper';
import { TypeIcon } from '@/components/ui/type-icon';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import { nodeMeState } from '../me-overrides';
import { nodeTeState } from '../te-overrides';
import type { BlueprintStructure } from '../types';
import { BuildLocationSelector } from './BuildLocationSelector';
import { BuildSkillsIndicator } from './BuildSkillsIndicator';
import { GemIcon, HourglassIcon, MeField, TeField } from './MeAdjuster';
import { usePricing } from './PricingProvider';
import { ReactionStructureSelect } from './ReactionStructureSelect';

// The Run-As frame's context subscriber (the HeroSteppers pattern — HeroCard
// itself stays context-free so the whole band doesn't re-render per price
// batch). Threads the build-character selection between the pricing context and
// the shared-zone frame.
function RunAsSelector() {
  const { buildCharacter, buildCharacterPending, buildCharacters, setBuildCharacter } =
    usePricing();
  return (
    <RunAsFrame
      buildCharacter={buildCharacter}
      buildCharacterPending={buildCharacterPending}
      buildCharacters={buildCharacters}
      onSelect={setBuildCharacter}
    />
  );
}

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
        <span className="inline-flex items-center gap-1">
          <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" />
          {/* Match the ME/TE rows' reserved revert slot so the three boxes stay
              flush whether or not a ↺ is showing. */}
          <span aria-hidden className="w-3.5 shrink-0" />
        </span>
      </StepperRow>
    </div>
  );
}

// The consolidated hero card: ONE equal-height plane of elements — the item
// render in a square frame (the building-character frame's exact twin), the
// stacked ME/TE/Runs boxed steppers, the square Run-As frame, and the two
// location groups side by side (Manufacturing, then Reactions; each a
// fixed-size System search over a Station select, bonus readout beside the
// header). The item's identity lives ABOVE the card (PlannerHead: centered
// name + the category/activity/per-run chips), so the card carries no title.
// Every cluster centers on the same 108px plane so nothing shifts as picks
// land; the band wraps cleanly on narrow viewports.
export function HeroCard({ structure }: { structure: BlueprintStructure }) {
  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;

  return (
    <div
      className={cn(
        'mb-3.5 mt-3.5 flex flex-wrap items-stretch gap-x-6 gap-y-3',
        'rounded-md border border-border bg-section px-[18px] py-4',
      )}
    >
      {/* The item render's boxed square. The building-character column shares
          its 108px width so the two brackets the steppers sit between stay on
          one plane (the character side is borderless by design). */}
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

      {/* The building character. The gap right of the frame is the Phase-3
          modification-icon seam: the skills→time indicator fills it now
          (absolutely positioned — zero footprint, nothing reflows), and the
          standings lever's icons join it later — don't crowd it otherwise. */}
      <div className="relative flex shrink-0">
        <RunAsSelector />
        <BuildSkillsIndicator structure={structure} />
      </div>

      {/* The two location groups side by side, always shown (a reaction root
          builds in a refinery too). The routing derives roles — a lone
          refinery does everything; adding a build structure takes over just
          the manufacturing nodes. */}
      <div className="flex flex-wrap gap-x-6 gap-y-3 sm:ml-auto">
        <BuildLocationSelector />
        <ReactionStructureSelect />
      </div>
    </div>
  );
}
