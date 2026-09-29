'use client';

import type { ReactNode } from 'react';
import { RunAsFrame } from '@/components/RunAsFrame';
import { Button } from '@/components/ui/button';
import { chipVariants } from '@/components/ui/chip';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { readoutSurface } from '@/components/ui/readout';
import { Stepper } from '@/components/ui/stepper';
import { eyebrow } from '@/components/ui/type-roles';
import { TypeIcon } from '@/components/type-icon';
import { blueprintImage } from '@/data/eve-data/type-images';
import { formatQuantity } from '@/lib/format/number';
import { activityLabel, EFFICIENCY_TONE_CLASSES, PLANNER_DISCLOSURE_TRIGGER_CLASS } from '../industry-styles';
import { nodeMeState } from '../me-overrides';
import { MANUFACTURING_ACTIVITY } from '../structure-bonus';
import { nodeTeState } from '../te-overrides';
import type { BlueprintStructure } from '../types';
import { useWatchlist } from '../use-watchlist';
import { isWatched } from '../watchlist';
import { BuildLocationSelector } from './BuildLocationSelector';
import { BuildSkillsIndicator } from './BuildSkillsIndicator';
import { GemIcon, HourglassIcon, MeField, TeField } from './MeAdjuster';
import { useBuildCharacter, useBuildPlan, usePlannerConfig } from './planner-contexts';
import { ReactionStructureSelect } from './ReactionStructureSelect';
import { TemplatesMenu } from './TemplatesMenu';

function SetupPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={cn(readoutSurface, 'flex flex-col gap-2.5 px-3.5 py-3')}>
      <h2 className={eyebrow({ size: 'micro' })}>{label}</h2>
      {children}
    </section>
  );
}

function WatchToggle({ structure }: { structure: BlueprintStructure }) {
  const { watchlist, toggle } = useWatchlist();
  const watched = watchlist !== null && isWatched(watchlist, structure.blueprintTypeId);
  return (
    <Button
      variant="bare"
      aria-pressed={watched}
      disabled={watchlist === null}
      onClick={() =>
        toggle({
          typeId: structure.blueprintTypeId,
          productTypeId: structure.product.typeId,
          name: structure.product.name,
        })
      }
      className={cn(
        chipVariants({ tone: 'green' }),
        PLANNER_DISCLOSURE_TRIGGER_CLASS,
        'cursor-pointer gap-1.5 py-1',
      )}
    >
      <span aria-hidden>{watched ? '★' : '☆'}</span>
      {watched ? 'Watching' : 'Watch'}
    </Button>
  );
}

function PlanIdentity({ structure }: { structure: BlueprintStructure }) {
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-4 xl:flex-col xl:items-start">
        <span className="flex size-20 shrink-0 items-center justify-center rounded-card border border-border bg-bg-deep/60 p-1.5 shadow-cta-glow xl:size-24">
          <TypeIcon
            {...blueprintImage(structure.blueprintTypeId)}
            size={88}
            alt={structure.product.name}
            mono={structure.product.name.slice(0, 2)}
            className="size-full"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">
            {structure.product.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-label uppercase tracking-label text-muted">
            {group && <span>{group}</span>}
            <Pill tone="blue">{activityLabel(structure.activityId)}</Pill>
            <Pill tone="neutral">{formatQuantity(structure.product.quantityPerRun)} per run</Pill>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TemplatesMenu blueprintTypeId={structure.blueprintTypeId} productName={structure.product.name} />
        <WatchToggle structure={structure} />
      </div>
    </header>
  );
}

function BuildAs({ structure }: { structure: BlueprintStructure }) {
  const { buildCharacter, buildCharacterPending, buildCharacters, setBuildCharacter } =
    useBuildCharacter();
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <RunAsFrame
        buildCharacter={buildCharacter}
        buildCharacterPending={buildCharacterPending}
        buildCharacters={buildCharacters}
        onSelect={setBuildCharacter}
      />
      <BuildSkillsIndicator structure={structure} />
    </div>
  );
}

function StepperRow({
  label,
  icon,
  labelClassName,
  children,
}: {
  label: string;
  icon?: ReactNode;
  labelClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-label uppercase tracking-wide text-muted',
          labelClassName,
        )}
      >
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

function PlanSteppers({
  blueprintTypeId,
  isManufacturing,
}: {
  blueprintTypeId: number;
  isManufacturing: boolean;
}) {
  const { runs, setRuns } = usePlannerConfig();
  const {
    ownedMe,
    meOverrides,
    setMeOverride,
    resetMeOverride,
    ownedTe,
    teOverrides,
    setTeOverride,
    resetTeOverride,
  } = useBuildPlan();
  const meState = nodeMeState(ownedMe?.get(blueprintTypeId), meOverrides.get(blueprintTypeId));
  const teState = nodeTeState(ownedTe?.get(blueprintTypeId), teOverrides.get(blueprintTypeId));
  return (
    <div className="flex flex-col gap-2">
      <StepperRow label="Runs">
        <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" reserveTrailing />
      </StepperRow>
      {isManufacturing && (
        <StepperRow
          label="ME"
          icon={<GemIcon state={meState} />}
          labelClassName={EFFICIENCY_TONE_CLASSES[meState].text}
        >
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
        <StepperRow
          label="TE"
          icon={<HourglassIcon state={teState} />}
          labelClassName={EFFICIENCY_TONE_CLASSES[teState].text}
        >
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
    </div>
  );
}

/**
 * The plan's context column: what is being built, then who builds it, how
 * many runs at what efficiency, and where. Below xl the setup panels sit in a
 * row under the identity.
 */
export function PlanSetup({ structure }: { structure: BlueprintStructure }) {
  return (
    <>
      <PlanIdentity structure={structure} />
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
        <SetupPanel label="Build as">
          <BuildAs structure={structure} />
        </SetupPanel>
        <SetupPanel label="Blueprint">
          <PlanSteppers
            blueprintTypeId={structure.blueprintTypeId}
            isManufacturing={structure.activityId === MANUFACTURING_ACTIVITY}
          />
        </SetupPanel>
        <SetupPanel label="Location">
          <div className="flex flex-col gap-3">
            <BuildLocationSelector />
            <ReactionStructureSelect />
          </div>
        </SetupPanel>
      </div>
    </>
  );
}
