'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Popover } from '@/components/ui/popover';
import { Stepper } from '@/components/ui/stepper';
import { effectiveMeOf, MAX_ME, nodeMeState, type NodeMeState } from '../me-overrides';
import { MAX_TE } from '../te-overrides';
import type { OwnedComponentDetail } from '../types';

// The interactive per-node efficiency controls (3.7.5.4 ME, 3.7.5.6 TE). Each
// manufacturable node carries two corner orbs: EVE's material-efficiency GEM and
// its time-efficiency HOURGLASS — blue when owned, orange when manually overridden,
// a faint outline when unowned. Each opens a small popover (a stepper + the owned
// baseline + a Revert). The gem popover also lists the owned blueprint's owner /
// location (the 3.7.5.5 readout). ME drives the cost ledger; TE drives the build
// time. Both share the adjuster primitives below — one orb/popover shape, two
// configs — so the gem and hourglass can never drift.

interface MeProps {
  // The producing blueprint's type id — the key the override map and `meOf` use.
  blueprintTypeId: number;
  // For the trigger/popover accessible name.
  name: string;
  ownedMe: Map<number, number> | null;
  meOverrides: Map<number, number>;
  setMeOverride: (blueprintTypeId: number, me: number) => void;
  resetMeOverride: (blueprintTypeId: number) => void;
  // The owned copy's owner / location readout, when this node is owned. Absent for
  // unowned / manual-only nodes → the gem popover stays ME-only.
  detail?: OwnedComponentDetail;
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

// Shared fill + glow for a filled (owned/manual) efficiency glyph.
function iconTone(state: NodeMeState): { fill: string; glow: string } {
  return state === 'manual'
    ? { fill: 'fill-[var(--color-dps-mid)]', glow: 'drop-shadow-[0_0_4px_var(--color-dps-mid)]' }
    : { fill: 'fill-evb-bright', glow: 'drop-shadow-[0_0_4px_var(--color-evb-glow)]' };
}

// EVE's material-efficiency gem. Sized by its container. Exported so the UX sandbox
// renders the same glyph (one source, no duplicate).
export function GemIcon({ state }: { state: NodeMeState }) {
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

// EVE's time-efficiency hourglass — the time-side twin of the gem, same tone logic.
// A bowtie silhouette with cap bars top and bottom.
export function HourglassIcon({ state }: { state: NodeMeState }) {
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
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="break-words text-right font-mono text-[10px] tracking-[0.04em] text-faint">{value}</span>
    </div>
  );
}

// The owner / location provenance rows shown under the gem's ME stepper for an owned
// node (TE moved to the hourglass orb, so it is no longer listed here).
function ProvenanceRows({ detail }: { detail: OwnedComponentDetail }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border-soft pt-1.5">
      <DetailRow label={detail.ownerType === 'corporation' ? 'Corp' : 'Owner'} value={detail.ownerName} />
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">At</span>
        <span className="break-words text-right font-mono text-[10px] tracking-[0.04em] text-faint">
          {detail.locationName}
          {/* The hangar / division the copy sits in — a faint sub-detail of the place. */}
          <span className="block text-[9px] tracking-[0.04em] text-muted">{detail.locationFlag}</span>
        </span>
      </div>
    </div>
  );
}

// The shared popover body: a stepper, an owned-level subscript, and a Revert (shown
// only when overridden, in ISK-green so it reads as an action). `children` carries
// any extra rows (the gem's owner/location readout).
function AdjusterPopoverBody({
  unitLabel,
  ariaUnit,
  name,
  owned,
  effective,
  max,
  isOverridden,
  setValue,
  reset,
  children,
}: {
  unitLabel: string;
  ariaUnit: string;
  name: string;
  owned: number | undefined;
  effective: number;
  max: number;
  isOverridden: boolean;
  setValue: (n: number) => void;
  reset: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{unitLabel}</span>
        <Stepper value={effective} onChange={setValue} min={0} max={max} ariaLabel={`${name} ${ariaUnit}`} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-[0.04em] text-faint">
          {owned !== undefined ? `owned ${owned}` : 'not owned'}
        </span>
        {isOverridden && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex cursor-pointer items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-isk hover:text-name"
          >
            ↺ Revert
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// A corner orb for a build-plan tier row — the gem (ME) and the hourglass (TE) are
// both this, pinned at different left offsets so they sit side by side. `faded` dims
// it with a focus-dimmed row.
function AdjusterOrb({
  label,
  icon,
  leftClass,
  faded,
  children,
}: {
  label: string;
  icon: ReactNode;
  leftClass: string;
  faded?: boolean;
  children: ReactNode;
}) {
  return (
    <Popover
      label={label}
      side="top"
      openOnHover={false}
      className="w-[184px]"
      triggerClassName={cn(
        'absolute top-0.5 z-10 h-[13px] w-[13px] cursor-pointer transition-opacity',
        leftClass,
        faded && 'opacity-25',
      )}
      trigger={icon}
    >
      {children}
    </Popover>
  );
}

function pillToneClass(state: NodeMeState): string {
  if (state === 'manual') return 'border-[var(--color-dps-mid)] text-[var(--color-dps-mid)]';
  if (state === 'owned') return 'border-evb-border text-evb-bright';
  return 'border-border text-muted';
}

// A header pill control — the gem and hourglass "main blueprint" controls are both
// this, an icon + "ME N" / "TE N" pill opening the adjuster popover.
function AdjusterMainControl({
  label,
  icon,
  unitLabel,
  effective,
  state,
  children,
}: {
  label: string;
  icon: ReactNode;
  unitLabel: string;
  effective: number;
  state: NodeMeState;
  children: ReactNode;
}) {
  return (
    <Popover
      label={label}
      side="bottom"
      openOnHover={false}
      className="w-[184px]"
      triggerClassName={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]',
        pillToneClass(state),
      )}
      trigger={
        <>
          <span className="inline-flex h-3 w-3 shrink-0">{icon}</span>
          {unitLabel} {effective}
          <span className="text-[8px]">▾</span>
        </>
      }
    >
      {children}
    </Popover>
  );
}

type Derived = ReturnType<typeof deriveAdjust>;

// The ME popover body for a node — written once, shared by the row orb and the main
// control (its only difference is `name`). The gem carries the owner/location readout.
function meBody(p: MeProps, d: Derived): ReactNode {
  return (
    <AdjusterPopoverBody
      unitLabel="ME"
      ariaUnit="material efficiency"
      name={p.name}
      owned={d.owned}
      effective={d.effective}
      max={MAX_ME}
      isOverridden={d.isOverridden}
      setValue={(n) => p.setMeOverride(p.blueprintTypeId, n)}
      reset={() => p.resetMeOverride(p.blueprintTypeId)}
    >
      {p.detail && <ProvenanceRows detail={p.detail} />}
    </AdjusterPopoverBody>
  );
}

// The TE popover body for a node — the time-side twin of `meBody`.
function teBody(p: TeProps, d: Derived): ReactNode {
  return (
    <AdjusterPopoverBody
      unitLabel="TE"
      ariaUnit="time efficiency"
      name={p.name}
      owned={d.owned}
      effective={d.effective}
      max={MAX_TE}
      isOverridden={d.isOverridden}
      setValue={(n) => p.setTeOverride(p.blueprintTypeId, n)}
      reset={() => p.resetTeOverride(p.blueprintTypeId)}
    />
  );
}

// The material-efficiency gem orb for a tier row (pinned far left).
export function MeRowOrb(props: MeProps & { faded?: boolean }) {
  const d = deriveAdjust(props.ownedMe, props.meOverrides, props.blueprintTypeId);
  return (
    <AdjusterOrb label={`${props.name} — set material efficiency`} leftClass="left-0.5" faded={props.faded} icon={<GemIcon state={d.state} />}>
      {meBody(props, d)}
    </AdjusterOrb>
  );
}

// The time-efficiency hourglass orb for a tier row (pinned just right of the gem).
export function TeRowOrb(props: TeProps & { faded?: boolean }) {
  const d = deriveAdjust(props.ownedTe, props.teOverrides, props.blueprintTypeId);
  return (
    <AdjusterOrb label={`${props.name} — set time efficiency`} leftClass="left-[18px]" faded={props.faded} icon={<HourglassIcon state={d.state} />}>
      {teBody(props, d)}
    </AdjusterOrb>
  );
}

// The main-blueprint ME control for the build-plan header (a T1 ship with no
// intermediate buildables has only the header controls).
export function MeMainControl(props: Omit<MeProps, 'name'>) {
  const p: MeProps = { ...props, name: 'main blueprint' };
  const d = deriveAdjust(p.ownedMe, p.meOverrides, p.blueprintTypeId);
  return (
    <AdjusterMainControl label="Main blueprint — set material efficiency" unitLabel="ME" effective={d.effective} state={d.state} icon={<GemIcon state={d.state} />}>
      {meBody(p, d)}
    </AdjusterMainControl>
  );
}

// The main-blueprint TE control for the build-plan header.
export function TeMainControl(props: Omit<TeProps, 'name'>) {
  const p: TeProps = { ...props, name: 'main blueprint' };
  const d = deriveAdjust(p.ownedTe, p.teOverrides, p.blueprintTypeId);
  return (
    <AdjusterMainControl label="Main blueprint — set time efficiency" unitLabel="TE" effective={d.effective} state={d.state} icon={<HourglassIcon state={d.state} />}>
      {teBody(p, d)}
    </AdjusterMainControl>
  );
}
