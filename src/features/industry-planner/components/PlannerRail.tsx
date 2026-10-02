'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { scrollArea } from '@/components/ui/scroll-area';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/ui/stepper';
import { blueprintImage } from '@/data/eve-data/type-images';
import { formatQuantity } from '@/lib/format/number';
import { authClient } from '@/platform/auth/auth-client';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { activityLabel, EFFICIENCY_TONE_CLASSES } from '../industry-styles';
import { nodeMeState } from '../me-overrides';
import { MANUFACTURING_ACTIVITY } from '../structure-bonus';
import { nodeTeState } from '../te-overrides';
import type { BlueprintStructure } from '../types';
import { CockpitKpis } from './CockpitKpis';
import { GemIcon, HourglassIcon, MeField, TeField } from './MeAdjuster';
import { useBuildPlan, useBuildSetup, usePlannerConfig } from './planner-contexts';

const PROFILES_HREF = '/industry';

function BlueprintCard({ structure }: { structure: BlueprintStructure }) {
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="grid size-[120px] place-items-center rounded-panel border border-border bg-bg-deep/60 p-2">
        <TypeIcon
          {...blueprintImage(structure.blueprintTypeId)}
          size={104}
          alt={structure.product.name}
          mono={structure.product.name.slice(0, 2)}
        />
      </div>
      <h2 className="font-display text-h2 font-bold uppercase leading-tight tracking-optical text-name">
        {structure.product.name}
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-2 text-label uppercase tracking-label text-muted">
        {group && <span>{group}</span>}
        <Pill tone="blue">{activityLabel(structure.activityId)}</Pill>
        <Pill tone="neutral">{formatQuantity(structure.product.quantityPerRun)} per run</Pill>
      </div>
    </div>
  );
}

const ctaClass = 'w-full justify-center';

/**
 * The profile the build prices under, switched in place; profiles are made
 * and edited on the Profiles tab. Without one the build is baseline, and the
 * way to one is signing in.
 */
function ProfileSwitch() {
  const { session, loading } = useAuth();
  const { profiles, profile, setProfileId } = useBuildSetup();
  if (loading || (session !== null && profiles === null)) {
    return <Skeleton label="Loading profiles" className="h-9 w-full rounded-ctl" />;
  }
  if (session === null) {
    return (
      <Button
        variant="primary"
        className={ctaClass}
        onClick={() => void authClient.signIn.oauth2({ providerId: 'eve', callbackURL: PROFILES_HREF })}
      >
        Create a profile
      </Button>
    );
  }
  if (profile === null || profiles === null) {
    return (
      <Link
        href={PROFILES_HREF}
        transitionTypes={['industry-tab']}
        className={cn(buttonVariants({ variant: 'primary' }), ctaClass)}
      >
        Create a profile
      </Link>
    );
  }
  return (
    <Select
      value={profile.id}
      onValueChange={setProfileId}
      items={profiles.map((p) => ({ value: p.id, label: p.name }))}
      ariaLabel="Production profile"
      className="w-full"
    />
  );
}

function StepperRow({ label, icon, tone, children }: { label: string; icon?: ReactNode; tone?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={cn('inline-flex items-center gap-1.5 text-label uppercase tracking-wide text-muted', tone)}>
        {label}
        {icon && (
          <span aria-hidden className="inline-flex size-3 shrink-0">
            {icon}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

function BuildSteppers({ structure }: { structure: BlueprintStructure }) {
  const { runs, setRuns } = usePlannerConfig();
  const plan = useBuildPlan();
  const id = structure.blueprintTypeId;
  const meState = nodeMeState(plan.ownedMe?.get(id), plan.meOverrides.get(id));
  const teState = nodeTeState(plan.ownedTe?.get(id), plan.teOverrides.get(id));
  const manufacturing = structure.activityId === MANUFACTURING_ACTIVITY;
  return (
    <div className="flex flex-col gap-2">
      {manufacturing && (
        <StepperRow label="ME" icon={<GemIcon state={meState} />} tone={EFFICIENCY_TONE_CLASSES[meState].text}>
          <MeField
            blueprintTypeId={id}
            name="main blueprint"
            ownedMe={plan.ownedMe}
            meOverrides={plan.meOverrides}
            setMeOverride={plan.setMeOverride}
            resetMeOverride={plan.resetMeOverride}
            boxed
          />
        </StepperRow>
      )}
      {manufacturing && (
        <StepperRow label="TE" icon={<HourglassIcon state={teState} />} tone={EFFICIENCY_TONE_CLASSES[teState].text}>
          <TeField
            blueprintTypeId={id}
            name="main blueprint"
            ownedTe={plan.ownedTe}
            teOverrides={plan.teOverrides}
            setTeOverride={plan.setTeOverride}
            resetTeOverride={plan.resetTeOverride}
            boxed
          />
        </StepperRow>
      )}
      <StepperRow label="Runs">
        <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" reserveTrailing />
      </StepperRow>
    </div>
  );
}

/** The blueprint, the profile it builds under, its inputs and its numbers, kept in view beside the build. */
export function PlannerRail({ structure }: { structure: BlueprintStructure }) {
  const { marginMode, setMarginMode } = usePlannerConfig();
  return (
    <aside
      aria-label="Blueprint"
      className={cn(
        scrollArea,
        'reveal flex min-w-0 flex-col gap-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1',
      )}
    >
      <Card className="flex flex-col gap-4 rounded-panel px-4 py-5">
        <BlueprintCard structure={structure} />
        <ProfileSwitch />
        <BuildSteppers structure={structure} />
      </Card>
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
    </aside>
  );
}
