'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Button, buttonVariants } from '@/components/ui/button';
import { chipVariants } from '@/components/ui/chip';
import { cn } from '@/components/ui/cn';
import { LivePrice } from '@/components/ui/live-price';
import { scrollArea } from '@/components/ui/scroll-area';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/ui/stepper';
import { blueprintImage } from '@/data/eve-data/type-images';
import { formatIsk } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import { authClient } from '@/platform/auth/auth-client';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { batchedCostOfRows } from '../cost-basis-view';
import { activityLabel, EFFICIENCY_TONE_CLASSES, PLANNER_DISCLOSURE_TRIGGER_CLASS } from '../industry-styles';
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
    <div className="flex items-center justify-between gap-3">
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
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
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

/** The build's shopping list and raw ledger, opened from the rail; the ledger opens over the build. */
function BuildTools({
  structure,
  ledgerOpen,
  onToggleLedger,
}: {
  structure: BlueprintStructure;
  ledgerOpen: boolean;
  onToggleLedger: () => void;
}) {
  const { pricing, refreshing } = useMarketData();
  const grandTotal = pricing ? batchedCostOfRows(pricing.rows) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultibuyPanel structure={structure} />
      <Button
        variant="bare"
        type="button"
        onClick={onToggleLedger}
        aria-expanded={ledgerOpen}
        className={cn(
          chipVariants({ tone: 'green' }),
          PLANNER_DISCLOSURE_TRIGGER_CLASS,
          'group cursor-pointer gap-2 py-1 transition-colors',
        )}
      >
        <span>Raw ledger</span>
        <LivePrice
          value={grandTotal !== null ? formatIsk(grandTotal) : '—'}
          pending={refreshing}
          className="text-ui font-semibold text-isk"
        />
        <span className={cn('inline-block text-micro text-muted transition-transform', ledgerOpen && 'rotate-180')}>
          ▾
        </span>
      </Button>
    </div>
  );
}

/** The blueprint, the profile it builds under, its tools and its numbers, kept in view beside the build. */
export function PlannerRail({
  structure,
  ledgerOpen,
  onToggleLedger,
}: {
  structure: BlueprintStructure;
  ledgerOpen: boolean;
  onToggleLedger: () => void;
}) {
  const { marginMode, setMarginMode } = usePlannerConfig();
  return (
    <aside
      aria-label="Blueprint"
      className={cn(
        scrollArea,
        'reveal flex min-w-0 flex-col gap-5 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1',
      )}
    >
      <BlueprintIdentity structure={structure} />
      <ProfileSwitch />
      <BuildTools structure={structure} ledgerOpen={ledgerOpen} onToggleLedger={onToggleLedger} />
      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
    </aside>
  );
}
