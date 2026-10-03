'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { scrollArea } from '@/components/ui/scroll-area';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/ui/stepper';
import { eyebrow } from '@/components/ui/type-roles';
import { blueprintImage } from '@/data/eve-data/type-images';
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import { authClient } from '@/platform/auth/auth-client';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { batchedCostOfRows } from '../cost-basis-view';
import { activityLabel, PLANNER_TOOL_TRIGGER_CLASS } from '../industry-styles';
import { nodeMeState } from '../me-overrides';
import { MANUFACTURING_ACTIVITY } from '../structure-bonus';
import { nodeTeState } from '../te-overrides';
import type { BlueprintStructure } from '../types';
import { CockpitKpis } from './CockpitKpis';
import { GemIcon, HourglassIcon, MeField, TeField } from './MeAdjuster';
import { MultibuyPanel } from './MultibuyPanel';
import { useBuildPlan, useBuildSetup, useMarketData, usePlannerConfig } from './planner-contexts';

const PROFILES_HREF = '/industry';

/**
 * The blueprint floats on the backdrop like a pilot's portrait, its research
 * and runs beside it and its name and kind beneath, with no card around it.
 */
function BlueprintIdentity({ structure }: { structure: BlueprintStructure }) {
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-h2 font-bold leading-tight text-name">{structure.product.name}</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-data text-micro uppercase tracking-label text-muted">
          {group && (
            <>
              <span>{group}</span>
              <span aria-hidden className="text-faint">·</span>
            </>
          )}
          <span className="text-tone-blue">{activityLabel(structure.activityId)}</span>
          <span aria-hidden className="text-faint">·</span>
          <span>{formatQuantity(structure.product.quantityPerRun)} per run</span>
        </p>
      </div>
      <div className="flex items-center gap-5">
        <TypeIcon
          {...blueprintImage(structure.blueprintTypeId)}
          size={112}
          alt={structure.product.name}
          mono={structure.product.name.slice(0, 2)}
          className="rounded-card shadow-cta-glow"
        />
        <BuildSteppers structure={structure} />
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
  const { profiles, profilesFailed, refreshProfiles, profile, setProfileId } = useBuildSetup();
  if (loading) {
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
  if (profiles === null) {
    return profilesFailed ? (
      <div className="flex items-center justify-between gap-2 text-ui text-muted">
        <span>Could not load profiles.</span>
        <Button type="button" variant="bare" onClick={refreshProfiles}>Retry</Button>
      </div>
    ) : <Skeleton label="Loading profiles" className="h-9 w-full rounded-ctl" />;
  }
  if (profile === null) {
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

/** Two arrows chasing each other: the job repeated, run after run. */
function RunsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full fill-none stroke-muted" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a7 7 0 0 1 12.5-4.3M20 13a7 7 0 0 1-12.5 4.3" />
      <path d="M17 3v4h-4M7 21v-4h4" />
    </svg>
  );
}

/** A stepper marked by its icon alone; the stepper carries the name for assistive tech. */
function StepperRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="inline-flex size-3.5 shrink-0">
        {icon}
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
    <div className="flex flex-col gap-2.5">
      {manufacturing && (
        <StepperRow icon={<GemIcon state={meState} />}>
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
        <StepperRow icon={<HourglassIcon state={teState} />}>
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
      <StepperRow icon={<RunsIcon />}>
        <Stepper value={runs} onChange={setRuns} min={1} ariaLabel="Runs" reserveTrailing />
      </StepperRow>
    </div>
  );
}

/** The build's shopping list, and a switch between the build and its raw ledger. */
function BuildTools({
  structure,
  ledgerShown,
  onToggleLedger,
}: {
  structure: BlueprintStructure;
  ledgerShown: boolean;
  onToggleLedger: () => void;
}) {
  const { pricing, refreshing } = useMarketData();
  const grandTotal = pricing ? batchedCostOfRows(pricing.rows) : null;
  return (
    <div className="flex gap-2">
      <MultibuyPanel structure={structure} />
      <Button
        variant="bare"
        type="button"
        onClick={onToggleLedger}
        aria-pressed={ledgerShown}
        className={cn(
          PLANNER_TOOL_TRIGGER_CLASS,
          'min-w-0 flex-1 aria-pressed:border-aurora/45 aria-pressed:text-isk aria-pressed:ring-4 aria-pressed:ring-aurora/12',
        )}
      >
        <span>Raw ledger</span>
        <LivePrice
          value={grandTotal !== null ? formatIsk(grandTotal) : '—'}
          pending={refreshing}
          className="font-data text-ui text-isk"
        />
      </Button>
    </div>
  );
}

/** The blueprint, the profile it builds under, its tools and its numbers, kept in view beside the build. */
export function PlannerRail({
  structure,
  ledgerShown,
  onToggleLedger,
}: {
  structure: BlueprintStructure;
  ledgerShown: boolean;
  onToggleLedger: () => void;
}) {
  const { marginMode, setMarginMode } = usePlannerConfig();
  return (
    <aside
      aria-label="Blueprint"
      className={cn(
        scrollArea,
        'reveal flex min-w-0 flex-col gap-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto',
        // Room inside the scroll box for the blueprint's glow, taken back
        // outside so the rail's edges stay where the column puts them; the
        // right side leaves space for the 10px scrollbar gutter.
        'lg:-mx-4 lg:-mt-4 lg:pt-4 lg:pr-1.5 lg:pb-4 lg:pl-4',
      )}
    >
      <BlueprintIdentity structure={structure} />
      <div className="flex flex-col gap-2">
        <h3 className={eyebrow({ size: 'micro', tone: 'muted' })}>Profiles</h3>
        <ProfileSwitch />
      </div>
      <BuildTools structure={structure} ledgerShown={ledgerShown} onToggleLedger={onToggleLedger} />
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
    </aside>
  );
}
