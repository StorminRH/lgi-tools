'use client';

import type { ReactNode } from 'react';
import { RunAsFrame } from '@/components/RunAsFrame';
import { cn } from '@/components/ui/cn';
import { Card } from '@/components/ui/card';
import { Stepper } from '@/components/ui/stepper';
import { TypeIcon } from '@/components/type-icon';
import { heroImage } from '@/data/eve-data/type-images';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import { EFFICIENCY_TONE_CLASSES } from '../industry-styles';
import { nodeMeState } from '../me-overrides';
import { nodeTeState } from '../te-overrides';
import type { BlueprintStructure } from '../types';
import { BuildLocationSelector } from './BuildLocationSelector';
import { BuildSkillsIndicator } from './BuildSkillsIndicator';
import { GemIcon, HourglassIcon, MeField, TeField } from './MeAdjuster';
import { useBuildCharacter, useBuildPlan, usePlannerConfig } from './planner-contexts';
import { ReactionStructureSelect } from './ReactionStructureSelect';

function RunAsSelector() {
  const { buildCharacter, buildCharacterPending, buildCharacters, setBuildCharacter } =
    useBuildCharacter();
  return (
    <RunAsFrame
      buildCharacter={buildCharacter}
      buildCharacterPending={buildCharacterPending}
      buildCharacters={buildCharacters}
      onSelect={setBuildCharacter}
    />
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

function HeroSteppers({
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
    <div className="flex flex-col justify-center gap-2">
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
      <StepperRow label="Runs">
        <Stepper
          value={runs}
          onChange={setRuns}
          min={1}
          ariaLabel="Runs"
          reserveTrailing
        />
      </StepperRow>

    </div>

  );
}

export function HeroCard({ structure }: { structure: BlueprintStructure }) {
  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;

  return (
    <Card
      className={cn(
        'mb-3.5 mt-3.5 flex min-w-0 w-full flex-wrap items-stretch gap-x-6 gap-y-3',
        'px-[18px] py-4',
      )}
    >
      {}
      <div className="flex aspect-square w-[108px] shrink-0 items-center justify-center rounded-ctl border border-border p-2">
        <TypeIcon
          {...heroImage(structure.blueprintTypeId)}
          size={88}
          alt={structure.product.name}
          mono={structure.product.name.slice(0, 2)}
        />
      </div>

      <HeroSteppers blueprintTypeId={structure.blueprintTypeId} isManufacturing={isManufacturing} />

      {}
      <div className="relative flex shrink-0">
        <RunAsSelector />
        <BuildSkillsIndicator structure={structure} />
      </div>

      {}
      <div className="flex min-w-0 w-full flex-wrap gap-x-6 gap-y-3 sm:ml-auto sm:w-auto">
        <BuildLocationSelector />
        <ReactionStructureSelect />
      </div>

    </Card>

  );
}
