'use client';

import { useCallback, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Stepper } from '@/components/ui/stepper';
import { effectiveMeOf, MAX_ME, nodeMeState, type NodeMeState } from '../me-overrides';
import { MAX_TE } from '../te-overrides';
import type { OwnedComponentDetail } from '../types';

// The interactive per-node efficiency controls (3.7.5.4 ME, 3.7.5.6 TE, 3.7.5.8
// steppers + icon popover). Each manufacturable node carries EVE's material-efficiency
// GEM and its time-efficiency HOURGLASS as editable fields: a number you scroll, arrow,
// type, or (with `steppers`) step with ▲/▼ (clamped ME 0-10 / TE 0-20). The VALUE's
// colour is the state — blue owned, orange a manual what-if, faint/empty unowned — so
// the field needs no extra baseline text; a ↺ appears only when overridden. ME drives
// the cost ledger; TE drives the build time. `NodeAdjusters` lays both fields out for a
// node's icon popover (steppers on); the hero card renders the `boxed` variant (the
// −/[value]/+ box, visually identical to the Runs Stepper, icon handled by the row
// label). The owner/location readout (`ProvenanceRows`) appears in that icon popover,
// after the adjusters.

interface MeProps {
  // The producing blueprint's type id — the key the override map and `meOf` use.
  blueprintTypeId: number;
  // For the field's accessible name.
  name: string;
  ownedMe: Map<number, number> | null;
  meOverrides: Map<number, number>;
  setMeOverride: (blueprintTypeId: number, me: number) => void;
  resetMeOverride: (blueprintTypeId: number) => void;
}

interface TeProps {
  blueprintTypeId: number;
  name: string;
  ownedTe: Map<number, number> | null;
  teOverrides: Map<number, number>;
  setTeOverride: (blueprintTypeId: number, te: number) => void;
  resetTeOverride: (blueprintTypeId: number) => void;
}

// Derive a node's display state from an owned + override map pair. The lookup and
// state helpers are level-agnostic (re-exported under TE names by te-overrides), so
// this one function serves BOTH the gem (ME maps) and the hourglass (TE maps).
function deriveAdjust(owned: Map<number, number> | null, overrides: Map<number, number>, bp: number) {
  const ownedValue = owned?.get(bp);
  const override = overrides.get(bp);
  return {
    owned: ownedValue,
    effective: effectiveMeOf(owned, overrides)(bp) ?? 0,
    state: nodeMeState(ownedValue, override),
    isOverridden: override !== undefined,
  };
}

// The glyph states: the node's ME/TE state tones, plus 'bonus' — the ISK-green
// used when the gem/hourglass stand for a STRUCTURE's reduction percents in the
// hero card's compact bonus readout (the green the old readout pills wore) —
// and 'reaction' — the reaction-purple hourglass in the build-character skills
// readout (3.7.19.1), telling reaction time apart from manufacturing time.
type IconState = NodeMeState | 'bonus' | 'reaction';

// Shared fill + glow for a filled efficiency glyph.
function iconTone(state: Exclude<IconState, 'unowned'>): { fill: string; glow: string } {
  if (state === 'bonus') {
    return { fill: 'fill-[var(--color-isk)]', glow: 'drop-shadow-[0_0_4px_var(--color-isk)]' };
  }
  if (state === 'reaction') {
    return {
      fill: 'fill-[var(--color-reaction-purple)]',
      glow: 'drop-shadow-[0_0_4px_var(--color-reaction-purple)]',
    };
  }
  return state === 'manual'
    ? { fill: 'fill-[var(--color-dps-mid)]', glow: 'drop-shadow-[0_0_4px_var(--color-dps-mid)]' }
    : { fill: 'fill-evb-bright', glow: 'drop-shadow-[0_0_4px_var(--color-evb-glow)]' };
}

/**
 * EVE's material-efficiency gem. Sized by its container. Exported so the UX sandbox
 * renders the same glyph (one source, no duplicate).
 */
export function GemIcon({ state }: { state: IconState }) {
  if (state === 'unowned') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full">
        <path
          d="M6 3h12l4 6-10 13L2 9Z"
          className="fill-none stroke-muted"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  const { fill, glow } = iconTone(state);
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('h-full w-full', glow)}>
      <path d="M6 3h12l4 6-10 13L2 9Z" className={fill} strokeLinejoin="round" />
      {/* The gem's facet lines — dark over the bright fill so it reads as cut stone. */}
      <path
        d="M11 3 8 9l4 13 4-13-3-6M2 9h20"
        fill="none"
        className="stroke-bg"
        strokeWidth={1.3}
        strokeOpacity={0.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * EVE's time-efficiency hourglass — the time-side twin of the gem, same tone logic.
 * A bowtie silhouette with cap bars top and bottom.
 */
export function HourglassIcon({ state }: { state: IconState }) {
  if (state === 'unowned') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full">
        <path
          d="M5 3h14l-7 9 7 9H5l7-9Z"
          className="fill-none stroke-muted"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path d="M4 3h16M4 21h16" className="stroke-muted" strokeWidth={2} strokeLinecap="round" />
      </svg>
    );
  }
  const { fill, glow } = iconTone(state);
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('h-full w-full', glow)}>
      <path d="M5 3h14l-7 9 7 9H5l7-9Z" className={fill} strokeLinejoin="round" />
      {/* Cap bars — dark over the bright fill, echoing the gem's facet treatment. */}
      <path d="M4 3h16M4 21h16" className="stroke-bg" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

// A label/value readout row in the gem popover (the owned-blueprint detail). Mono,
// to match the stepper rows; the value wraps for long station names.
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 font-mono text-label uppercase tracking-emphasis text-muted">{label}</span>
      <span className="break-words text-right font-mono text-micro tracking-copy text-faint">{value}</span>
    </div>
  );
}

/**
 * The owner / location provenance rows shown under the gem's ME stepper for an owned
 * node (TE moved to the hourglass orb, so it is no longer listed here).
 */
export function ProvenanceRows({ detail }: { detail: OwnedComponentDetail }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border-soft pt-1.5">
      <DetailRow label={detail.ownerType === 'corporation' ? 'Corp' : 'Owner'} value={detail.ownerName} />
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 font-mono text-label uppercase tracking-emphasis text-muted">At</span>
        <span className="break-words text-right font-mono text-micro tracking-copy text-faint">
          {detail.locationName}
          {/* The hangar / division the copy sits in — a faint sub-detail of the place. */}
          <span className="block text-micro tracking-copy text-muted">{detail.locationFlag}</span>
        </span>
      </div>
    </div>
  );
}

type Derived = ReturnType<typeof deriveAdjust>;

// One efficiency control: Base UI owns typing, clamping, arrow keys, wheel
// behavior, and commit semantics. Operator direction on 2026-07-26 explicitly
// chose the shared primitive behavior for empty unowned fields and other small
// interaction differences during the adoption pass.
function EfficiencyField({
  icon,
  ariaUnit,
  name,
  max,
  d,
  onCommit,
  onRevert,
  boxed = false,
}: {
  icon: ReactNode;
  ariaUnit: string;
  name: string;
  max: number;
  d: Derived;
  onCommit: (n: number) => void;
  onRevert: () => void;
  // Show the up/down step buttons flanking the field (the popover layout). The inline
  // header field omits them (the wheel + arrow keys still step it).
  steppers?: boolean;
  // The hero-card layout: a −/[value]/+ box visually identical to the Runs Stepper.
  // The icon is NOT rendered here — the hero row shows it beside its ME/TE label.
  boxed?: boolean;
}) {
  const revertButton = d.isOverridden ? (
    <Button
      variant="bare"
      type="button"
      aria-label={`Reset ${name} ${ariaUnit}`}
      onClick={(e) => {
        e.stopPropagation();
        onRevert();
      }}
      // 13px (not the row's 10px): the ↺ was too easy to miss. Still narrower
      // than its reserved w-3.5 slot, so growing it never pushes the boxes.
      className="cursor-pointer font-mono text-ui leading-none text-isk hover:text-name"
    >
      ↺
    </Button>
  ) : null;
  return (
    <span
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {!boxed && <span className="inline-flex h-3 w-3 shrink-0">{icon}</span>}
      <Stepper
        value={d.effective}
        onChange={onCommit}
        min={0}
        max={max}
        ariaLabel={`${name} ${ariaUnit}`}
        variant={boxed ? 'default' : 'inline'}
        trailing={revertButton}
        reserveTrailing={boxed}
      />
    </span>
  );
}

/**
 * The material-efficiency inline field for a node (or the hero card, `boxed`). `name`
 * is "main blueprint" in the hero.
 */
export function MeField({ blueprintTypeId, name, ownedMe, meOverrides, setMeOverride, resetMeOverride, steppers, boxed }: MeProps & { steppers?: boolean; boxed?: boolean }) {
  const d = deriveAdjust(ownedMe, meOverrides, blueprintTypeId);
  // Stable callbacks so the field's native wheel listener re-registers only on a
  // value change, not on every render.
  const onCommit = useCallback((n: number) => setMeOverride(blueprintTypeId, n), [setMeOverride, blueprintTypeId]);
  const onRevert = useCallback(() => resetMeOverride(blueprintTypeId), [resetMeOverride, blueprintTypeId]);
  return (
    <EfficiencyField
      icon={<GemIcon state={d.state} />}
      ariaUnit="material efficiency"
      name={name}
      max={MAX_ME}
      d={d}
      onCommit={onCommit}
      onRevert={onRevert}
      steppers={steppers}
      boxed={boxed}
    />
  );
}

/** The time-efficiency inline field — the time-side twin of MeField. */
export function TeField({ blueprintTypeId, name, ownedTe, teOverrides, setTeOverride, resetTeOverride, steppers, boxed }: TeProps & { steppers?: boolean; boxed?: boolean }) {
  const d = deriveAdjust(ownedTe, teOverrides, blueprintTypeId);
  const onCommit = useCallback((n: number) => setTeOverride(blueprintTypeId, n), [setTeOverride, blueprintTypeId]);
  const onRevert = useCallback(() => resetTeOverride(blueprintTypeId), [resetTeOverride, blueprintTypeId]);
  return (
    <EfficiencyField
      icon={<HourglassIcon state={d.state} />}
      ariaUnit="time efficiency"
      name={name}
      max={MAX_TE}
      d={d}
      onCommit={onCommit}
      onRevert={onRevert}
      steppers={steppers}
      boxed={boxed}
    />
  );
}

// A labelled efficiency row (the label, then the inline field) for the node's icon
// popover. Mono label to match the field digits.
function AdjusterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="font-mono text-label uppercase tracking-emphasis text-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * The two labelled fields (gem ME + hourglass TE) that fill a buildable node's icon
 * popover (3.7.5.8) — one source for the live planner and the sandbox. The frame tone
 * and the popover shell live in NodeCard; this is only the body.
 */
export function NodeAdjusters({
  blueprintTypeId,
  name,
  ownedMe,
  meOverrides,
  setMeOverride,
  resetMeOverride,
  ownedTe,
  teOverrides,
  setTeOverride,
  resetTeOverride,
}: MeProps & Omit<TeProps, 'blueprintTypeId' | 'name'>) {
  return (
    <div className="flex flex-col gap-2.5">
      <AdjusterRow label="Material Efficiency">
        <MeField
          blueprintTypeId={blueprintTypeId}
          name={name}
          ownedMe={ownedMe}
          meOverrides={meOverrides}
          setMeOverride={setMeOverride}
          resetMeOverride={resetMeOverride}
          steppers
        />
      </AdjusterRow>
      <AdjusterRow label="Time Efficiency">
        <TeField
          blueprintTypeId={blueprintTypeId}
          name={name}
          ownedTe={ownedTe}
          teOverrides={teOverrides}
          setTeOverride={setTeOverride}
          resetTeOverride={resetTeOverride}
          steppers
        />
      </AdjusterRow>
    </div>
  );
}
