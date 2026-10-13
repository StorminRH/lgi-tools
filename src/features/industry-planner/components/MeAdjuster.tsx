'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Stepper } from '@/components/ui/stepper';
import { eyebrow } from '@/components/ui/type-roles';
import { effectiveEfficiencyOf, efficiencyGlyphState, MAX_ME, MAX_TE } from '../efficiency';
import { EFFICIENCY_TONE_CLASSES, type EfficiencyToneState } from '../industry-styles';
import type { OwnedComponentDetail } from '../types';
import { IndustryGlyph } from './IndustryGlyph';
import { useBuildPlan, type BuildPlanValue } from './planner-contexts';

type EfficiencyKind = 'me' | 'te';

/** Each research attribute's stepper bounds, its spoken unit, and the plan fields it reads and writes. */
const KIND = {
  me: {
    ariaUnit: 'material efficiency',
    max: MAX_ME,
    pick: (plan: BuildPlanValue) => ({
      owned: plan.ownedMe,
      overrides: plan.meOverrides,
      set: plan.setMeOverride,
      reset: plan.resetMeOverride,
    }),
  },
  te: {
    ariaUnit: 'time efficiency',
    max: MAX_TE,
    pick: (plan: BuildPlanValue) => ({
      owned: plan.ownedTe,
      overrides: plan.teOverrides,
      set: plan.setTeOverride,
      reset: plan.resetTeOverride,
    }),
  },
} satisfies Record<EfficiencyKind, unknown>;

/** One blueprint's ME or TE as the plan holds it: the value in force, its tone, and the writes that change it. */
function useEfficiency(kind: EfficiencyKind, blueprintTypeId: number) {
  const { owned, overrides, set, reset } = KIND[kind].pick(useBuildPlan());
  const override = overrides.get(blueprintTypeId);
  return {
    effective: effectiveEfficiencyOf(owned, overrides)(blueprintTypeId) ?? 0,
    state: efficiencyGlyphState(owned?.get(blueprintTypeId), override),
    isOverridden: override !== undefined,
    onCommit: (n: number) => set(blueprintTypeId, n),
    onRevert: () => reset(blueprintTypeId),
  };
}

/** CCP's glyph in its efficiency tone. The glow sits on a wrapper because a mask clips its own element's filter. */
function ToneGlyph({ glyph, state }: { glyph: EfficiencyKind; state: EfficiencyToneState }) {
  const tone = EFFICIENCY_TONE_CLASSES[state];
  return (
    <span aria-hidden className={cn('block size-full', tone.glow)}>
      <IndustryGlyph glyph={glyph} className={tone.text} />
    </span>
  );
}

export function GemIcon({ state }: { state: EfficiencyToneState }) {
  return <ToneGlyph glyph="me" state={state} />;
}

export function HourglassIcon({ state }: { state: EfficiencyToneState }) {
  return <ToneGlyph glyph="te" state={state} />;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-ui text-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-ui leading-snug text-text">{value}</span>
    </div>
  );
}

export function ProvenanceRows({ detail }: { detail: OwnedComponentDetail }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border-soft pt-1.5">
      <DetailRow label={detail.ownerType === 'corporation' ? 'Corp' : 'Owner'} value={detail.ownerName} />
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-ui text-muted">At</span>
        <span className="min-w-0 break-words text-right text-ui leading-snug text-text">
          {detail.locationName}
          <span className="block text-ui leading-snug text-muted">{detail.locationFlag}</span>
          {detail.containerName ? (
            <span className="block text-ui leading-snug text-muted">{detail.containerName}</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** A stepper marked by its icon alone; the stepper carries the name for assistive tech. */
export function StepperRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="inline-flex size-3.5 shrink-0">
        {icon}
      </span>
      {children}
    </div>
  );
}

/**
 * A blueprint's ME or TE stepper, read from and written to the build plan.
 * Boxed, it sits in its own icon row; inline, it carries a small icon of its own.
 */
function EfficiencyField({
  kind,
  blueprintTypeId,
  name,
  boxed = false,
}: {
  kind: EfficiencyKind;
  blueprintTypeId: number;
  name: string;
  boxed?: boolean;
}) {
  const { ariaUnit, max } = KIND[kind];
  const field = useEfficiency(kind, blueprintTypeId);
  const icon = <ToneGlyph glyph={kind} state={field.state} />;
  const revertButton = field.isOverridden ? (
    <Button
      variant="bare"
      type="button"
      aria-label={`Reset ${name} ${ariaUnit}`}
      onClick={(e) => {
        e.stopPropagation();
        field.onRevert();
      }}
      className="cursor-pointer text-ui leading-none text-isk hover:text-name"
    >
      ↺
    </Button>
  ) : null;
  const stepper = (
    <span
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {!boxed && <span className="inline-flex h-3 w-3 shrink-0">{icon}</span>}
      <Stepper
        value={field.effective}
        onChange={field.onCommit}
        min={0}
        max={max}
        ariaLabel={`${name} ${ariaUnit}`}
        variant={boxed ? 'default' : 'inline'}
        trailing={revertButton}
        reserveTrailing={boxed}
        valueClassName={EFFICIENCY_TONE_CLASSES[field.state].text}
      />
    </span>
  );
  return boxed ? <StepperRow icon={icon}>{stepper}</StepperRow> : stepper;
}

/** The blueprint's ME and TE as two boxed icon rows, for a column of steppers. */
export function EfficiencyStepperRows({ blueprintTypeId, name }: { blueprintTypeId: number; name: string }) {
  return (
    <>
      <EfficiencyField kind="me" blueprintTypeId={blueprintTypeId} name={name} boxed />
      <EfficiencyField kind="te" blueprintTypeId={blueprintTypeId} name={name} boxed />
    </>
  );
}

function AdjusterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className={eyebrow({ font: 'inherit', weight: 'inherit' })}>{label}</span>
      {children}
    </div>
  );
}

/** The build card's research popover: the blueprint's ME and TE, each under its label. */
export function NodeAdjusters({ blueprintTypeId, name }: { blueprintTypeId: number; name: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <AdjusterRow label="Material Efficiency">
        <EfficiencyField kind="me" blueprintTypeId={blueprintTypeId} name={name} />
      </AdjusterRow>
      <AdjusterRow label="Time Efficiency">
        <EfficiencyField kind="te" blueprintTypeId={blueprintTypeId} name={name} />
      </AdjusterRow>
    </div>
  );
}
