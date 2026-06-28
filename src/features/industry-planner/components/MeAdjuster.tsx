'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { effectiveMeOf, MAX_ME, nodeMeState, type NodeMeState } from '../me-overrides';
import { MAX_TE } from '../te-overrides';
import type { OwnedComponentDetail } from '../types';

// The interactive per-node efficiency controls (3.7.5.4 ME, 3.7.5.6 TE, 3.7.5.7
// inline). Each manufacturable node carries EVE's material-efficiency GEM and its
// time-efficiency HOURGLASS as INLINE editable fields: the icon + a number you
// scroll, arrow, or type (clamped ME 0-10 / TE 0-20). The VALUE's colour is the
// state — blue owned, orange a manual what-if, faint/empty unowned — so the field
// needs no extra baseline text; a ↺ appears only when overridden. ME drives the cost
// ledger; TE drives the build time. The owner/location readout (`ProvenanceRows`)
// moved to the node's QTY-ring hover.

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
export function ProvenanceRows({ detail }: { detail: OwnedComponentDetail }) {
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

type Derived = ReturnType<typeof deriveAdjust>;

// The value's text colour IS the node's state — owned (blue), manual override
// (orange), unowned (faint) — so the field needs no separate baseline text.
function valueToneClass(state: NodeMeState): string {
  if (state === 'manual') return 'text-[var(--color-dps-mid)]';
  if (state === 'owned') return 'text-evb-bright';
  return 'text-faint';
}

// One inline efficiency control: the icon + an editable number you scroll, arrow, or
// type (clamped 0–max). The value's colour is the state; a ↺ appears only when it's a
// manual override (click resets to owned). Empty when unowned-and-unset. The field
// stops its own clicks/keys so the node card's drill-down doesn't fire. Shared by the
// gem (ME) and hourglass (TE) configs.
function EfficiencyField({
  icon,
  ariaUnit,
  name,
  max,
  d,
  onCommit,
  onRevert,
}: {
  icon: ReactNode;
  ariaUnit: string;
  name: string;
  max: number;
  d: Derived;
  onCommit: (n: number) => void;
  onRevert: () => void;
}) {
  // Shown value: empty when unowned-and-unset, else the effective number.
  const shown = d.state === 'unowned' && !d.isOverridden ? '' : String(d.effective);
  const [draft, setDraft] = useState(shown);
  // Reflect external changes (a revert / another field) without an effect — the
  // Stepper's adjust-state-during-render sync.
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    setDraft(shown);
  }
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    setDraft(raw);
    if (raw === '') return; // cleared → revert handled on blur
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= max) onCommit(n);
  };
  const step = (delta: number) => {
    const n = Math.min(max, Math.max(0, d.effective + delta));
    onCommit(n);
    setDraft(String(n));
  };
  // React registers `onWheel` as a PASSIVE root listener, so an `e.preventDefault()`
  // there is silently ignored — a focused field would step AND scroll the page. A
  // native non-passive listener lets preventDefault suppress the page scroll; the
  // focus gate keeps scrolling past an unfocused field from nudging it. The step is
  // inlined (not a call to `step`) so the listener's deps stay stable values, not the
  // per-render closure.
  useEffect(() => {
    const el = inputRef.current;
    if (el === null) return;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return;
      e.preventDefault();
      const next = Math.min(max, Math.max(0, d.effective + (e.deltaY < 0 ? 1 : -1)));
      onCommit(next);
      setDraft(String(next));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [d.effective, max, onCommit]);
  return (
    // Stop clicks/keys reaching the node card so editing never triggers its drill-down.
    <span
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="inline-flex h-3 w-3 shrink-0">{icon}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={draft}
        placeholder="–"
        aria-label={`${name} ${ariaUnit}`}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          }
        }}
        onBlur={() => {
          if (draft === '' && d.isOverridden) onRevert();
          setDraft(shown);
        }}
        className={cn(
          'w-[22px] bg-transparent text-center font-mono text-[11px] tabular-nums outline-none',
          'placeholder:text-faint [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          valueToneClass(d.state),
        )}
      />
      {d.isOverridden && (
        <button
          type="button"
          aria-label={`Reset ${name} ${ariaUnit}`}
          onClick={(e) => {
            e.stopPropagation();
            onRevert();
          }}
          className="cursor-pointer font-mono text-[10px] leading-none text-isk hover:text-name"
        >
          ↺
        </button>
      )}
    </span>
  );
}

// The material-efficiency inline field for a node (or the build-plan header). `name`
// is "main blueprint" in the header.
export function MeField({ blueprintTypeId, name, ownedMe, meOverrides, setMeOverride, resetMeOverride }: MeProps) {
  const d = deriveAdjust(ownedMe, meOverrides, blueprintTypeId);
  return (
    <EfficiencyField
      icon={<GemIcon state={d.state} />}
      ariaUnit="material efficiency"
      name={name}
      max={MAX_ME}
      d={d}
      onCommit={(n) => setMeOverride(blueprintTypeId, n)}
      onRevert={() => resetMeOverride(blueprintTypeId)}
    />
  );
}

// The time-efficiency inline field — the time-side twin of MeField.
export function TeField({ blueprintTypeId, name, ownedTe, teOverrides, setTeOverride, resetTeOverride }: TeProps) {
  const d = deriveAdjust(ownedTe, teOverrides, blueprintTypeId);
  return (
    <EfficiencyField
      icon={<HourglassIcon state={d.state} />}
      ariaUnit="time efficiency"
      name={name}
      max={MAX_TE}
      d={d}
      onCommit={(n) => setTeOverride(blueprintTypeId, n)}
      onRevert={() => resetTeOverride(blueprintTypeId)}
    />
  );
}
