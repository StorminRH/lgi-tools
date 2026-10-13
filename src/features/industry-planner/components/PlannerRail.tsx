'use client';

import Link from 'next/link';
import { TypeIcon } from '@/components/type-icon';
import { backAction, Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { StarIcon } from '@/components/ui/icons';
import { LivePrice } from '@/components/ui/live-price';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Stepper } from '@/components/ui/stepper';
import { eyebrow } from '@/components/ui/type-roles';
import { activityLabel } from '@/data/eve-data/constants';
import { blueprintImage } from '@/data/eve-data/type-images';
import { formatIsk } from '@/lib/format/isk';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { startEveSignIn } from '@/platform/auth/link-character';
import { batchedCostOfRows } from '../cost-basis-view';
import { useFavoriteBlueprints } from '../favorite-blueprints';
import { PLANNER_TOOL_TRIGGER_CLASS } from '../industry-styles';
import { MANUFACTURING_ACTIVITY } from '../structure-bonus';
import type { BlueprintStructure } from '../types';
import { BlueprintMetaLine } from './BlueprintMetaLine';
import { CockpitKpis } from './CockpitKpis';
import { IndustryGlyph } from './IndustryGlyph';
import { LoadFailed } from '@/components/ui/load-failed';
import { EfficiencyStepperRows, StepperRow } from './MeAdjuster';
import { MultibuyPanel } from './MultibuyPanel';
import { useBuildSetup, useMarketData, usePlannerConfig } from './planner-contexts';

const PROFILES_HREF = '/industry';
const SEARCH_HREF = '/industry/planner';

/** Stars the blueprint so the planner's landing page lists it. */
function FavoriteStar({ typeId, name }: { typeId: number; name: string }) {
  const { favorites, toggle } = useFavoriteBlueprints();
  const starred = favorites?.some((f) => f.typeId === typeId) ?? false;
  return (
    <Button
      variant="bare"
      type="button"
      aria-label="Favorite"
      aria-pressed={starred}
      disabled={favorites === null}
      onClick={() => toggle({ typeId, name })}
      className="mt-1 size-7 shrink-0 justify-center rounded-ctl text-muted hover:text-isk aria-pressed:text-isk"
    >
      <StarIcon size={18} className={cn(starred && 'fill-current')} />
    </Button>
  );
}

/**
 * The blueprint floats on the backdrop like a pilot's portrait, its research
 * and runs beside it and its name and kind beneath, with no card around it.
 */
function BlueprintIdentity({ structure }: { structure: BlueprintStructure }) {
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Link
          href={SEARCH_HREF}
          transitionTypes={['industry-tab']}
          className={cn(backAction, 'mb-2 no-underline')}
        >
          <span aria-hidden>←</span> Back to search
        </Link>
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 font-display text-h2 font-bold leading-tight text-name">{structure.product.name}</h2>
          <FavoriteStar typeId={structure.blueprintTypeId} name={structure.product.name} />
        </div>
        <BlueprintMetaLine
          group={group}
          activity={activityLabel(structure.activityId)}
          perRun={structure.product.quantityPerRun}
        />
      </div>
      <div className="flex items-center gap-5">
        <TypeIcon
          {...blueprintImage(structure.blueprintTypeId)}
          size={112}
          alt={structure.product.name}
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
        onClick={() => startEveSignIn(PROFILES_HREF)}
      >
        Create a profile
      </Button>
    );
  }
  if (profiles === null) {
    return profilesFailed ? (
      <LoadFailed
        title="Profiles didn't load"
        detail="Pricing without a profile"
        retryLabel="Retry loading profiles"
        onRetry={refreshProfiles}
      />
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

function BuildSteppers({ structure }: { structure: BlueprintStructure }) {
  const { runs, setRuns } = usePlannerConfig();
  return (
    <div className="flex flex-col gap-2.5">
      {structure.activityId === MANUFACTURING_ACTIVITY && (
        <EfficiencyStepperRows blueprintTypeId={structure.blueprintTypeId} name="main blueprint" />
      )}
      <StepperRow icon={<IndustryGlyph glyph="runs" className="text-muted" />}>
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
          value={formatIsk(grandTotal)}
          pending={refreshing}
          className="font-data text-ui text-isk"
        />
      </Button>
    </div>
  );
}

/** The blueprint, the profile it builds under, its tools and its numbers, beside the build and open to the page. */
export function PlannerRail({
  structure,
  ledgerShown,
  onToggleLedger,
}: {
  structure: BlueprintStructure;
  ledgerShown: boolean;
  onToggleLedger: () => void;
}) {
  return (
    <aside aria-label="Blueprint" className="reveal flex min-w-0 flex-col gap-5">
      <BlueprintIdentity structure={structure} />
      <div className="flex flex-col gap-2">
        <h3 className={eyebrow({ size: 'micro', tone: 'muted' })}>Profiles</h3>
        <ProfileSwitch />
      </div>
      <BuildTools structure={structure} ledgerShown={ledgerShown} onToggleLedger={onToggleLedger} />
      <CockpitKpis structure={structure} />
    </aside>
  );
}
