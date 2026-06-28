'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Popover, PopoverHeading } from '@/components/ui/popover';
import { TypeIcon } from '@/components/ui/type-icon';
import { VariantFrame } from '../_shared/sandbox-ui';
import { GemIcon } from '@/features/industry-planner/components/MeAdjuster';
import {
  clampMe,
  effectiveMeOf,
  MAX_ME,
  nodeMeState,
  type NodeMeState,
} from '@/features/industry-planner/me-overrides';

// 3.7.5.4 — UX exploration sandbox for the per-node ME adjuster. Five interaction
// patterns for overriding a buildable node's material efficiency (0–10), all fed
// the SAME mock build + driven by the REAL `me-overrides` helpers, so only the
// visual/interaction treatment varies. Hand-built scaffolding (steppers, scale) is
// fine here — it's a scratchpad; the shipped control adopts a `components/ui`
// primitive once Ryan picks a variant. No DB / session / live reads.

// --- Mock build ----------------------------------------------------------
// One main blueprint + three component rows authored to show every state at rest:
// an owned researched copy (blue), an unowned node (faint), and an owned copy that
// has been manually overridden (orange). Keyed by producing blueprint type id, the
// same key the real owned-ME map uses. Component type ids are synthetic (private
// range) so TypeIcon 404s and falls back to a clean monogram offline.
interface MockRow {
  bp: number;
  typeId: number;
  name: string;
  label: string;
  mono: string;
  qty: string;
  ownedMe?: number;
}

const MAIN: MockRow = {
  bp: 1000,
  typeId: 9_000_000,
  name: 'Loki',
  label: 'Strategic Cruiser · main blueprint',
  mono: 'LK',
  qty: '× 1',
  ownedMe: 10,
};

const ROWS: MockRow[] = [
  {
    bp: 1001,
    typeId: 9_000_001,
    name: 'Magnetometric Sensor Cluster',
    label: 'Construction Components',
    mono: 'SC',
    qty: '× 6',
    ownedMe: 5,
  },
  {
    bp: 1002,
    typeId: 9_000_002,
    name: 'Nanoelectrical Microprocessor',
    label: 'Construction Components',
    mono: 'NM',
    qty: '× 40',
  },
  {
    bp: 1003,
    typeId: 9_000_003,
    name: 'Nanotransistors',
    label: 'Construction Components',
    mono: 'NT',
    qty: '× 12',
    ownedMe: 8,
  },
];

// The caller's owned ME, best-copy-per-blueprint — the shape PricingContext hands
// the planner. Built once from the mock so the helpers see the real input type.
const OWNED: Map<number, number> = new Map(
  [MAIN, ...ROWS]
    .filter((r): r is MockRow & { ownedMe: number } => r.ownedMe !== undefined)
    .map((r) => [r.bp, r.ownedMe]),
);

// Row 1003 starts overridden (owned ME8 → manual ME10) so the orange "manual"
// state is visible at rest without the reviewer having to touch anything.
const INITIAL_OVERRIDES: ReadonlyArray<readonly [number, number]> = [[1003, 10]];

// --- Override state (the real clamp + lookup) ----------------------------
interface Overrides {
  overrides: Map<number, number>;
  setOverride: (bp: number, raw: number) => void;
  resetOverride: (bp: number) => void;
}

function useOverrides(): Overrides {
  const [overrides, setOverrides] = useState<Map<number, number>>(
    () => new Map(INITIAL_OVERRIDES),
  );
  const setOverride = useCallback((bp: number, raw: number) => {
    setOverrides((prev) => new Map(prev).set(bp, clampMe(raw)));
  }, []);
  const resetOverride = useCallback((bp: number) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(bp);
      return next;
    });
  }, []);
  return { overrides, setOverride, resetOverride };
}

// Everything one row's control needs, derived from the override state through the
// real helpers — so each variant is purely a different rendering of the same data.
interface Ctl {
  bp: number;
  owned: number | undefined;
  effective: number;
  state: NodeMeState;
  isOverridden: boolean;
  setMe: (n: number) => void;
  reset: () => void;
}

function ctlFor(ov: Overrides, bp: number): Ctl {
  const owned = OWNED.get(bp);
  const override = ov.overrides.get(bp);
  return {
    bp,
    owned,
    effective: effectiveMeOf(OWNED, ov.overrides)(bp) ?? 0,
    state: nodeMeState(owned, override),
    isOverridden: ov.overrides.has(bp),
    setMe: (n) => ov.setOverride(bp, n),
    reset: () => ov.resetOverride(bp),
  };
}

// --- Tone helpers (owned = blue, manual = orange, unowned = faint) --------
function valueToneClass(state: NodeMeState): string {
  if (state === 'manual') return 'text-[var(--color-dps-mid)]';
  if (state === 'owned') return 'text-evb-bright';
  return 'text-muted';
}

function pillClass(state: NodeMeState): string {
  if (state === 'manual') return 'border-[var(--color-dps-mid)] text-[var(--color-dps-mid)]';
  if (state === 'owned') return 'border-evb-border text-evb-bright';
  return 'border-border text-muted';
}

// --- Shared building blocks ----------------------------------------------
const SBX_ROW =
  'relative grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-[9px] min-h-[44px] border-t border-border-soft first:border-t-0';

function RowInner({ row, control }: { row: MockRow; control: ReactNode }) {
  return (
    <>
      <TypeIcon typeId={row.typeId} size={30} mono={row.mono} />
      <div className="flex min-w-0 flex-col gap-px">
        <span className="line-clamp-2 break-words font-mono text-[12.5px] font-medium leading-[1.28] text-name">
          {row.name}
        </span>
        <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
          {row.label} · {row.qty}
        </span>
      </div>
      <span className="justify-self-end">{control}</span>
    </>
  );
}

// The honest "owned vs manual" header inside every adjuster panel.
function StateTag({ state }: { state: NodeMeState }) {
  const text = state === 'manual' ? 'Manual override' : state === 'owned' ? 'Owned blueprint' : 'Not owned';
  return (
    <span className={cn('font-mono text-[9.5px] uppercase tracking-[0.14em]', valueToneClass(state))}>
      {text}
    </span>
  );
}

function BaselineLine({ owned }: { owned: number | undefined }) {
  if (owned !== undefined && owned > 0) {
    return <span className="font-mono text-[10.5px] text-evb-bright">Your blueprint · ME {owned}</span>;
  }
  return <span className="font-mono text-[10.5px] text-muted">Not owned · assumes ME 0</span>;
}

function ResetButton({ ctl }: { ctl: Ctl }) {
  if (!ctl.isOverridden) return null;
  const to = ctl.owned !== undefined && ctl.owned > 0 ? `owned ME ${ctl.owned}` : 'ME 0';
  return (
    <button
      type="button"
      onClick={ctl.reset}
      className="self-start cursor-pointer font-mono text-[10px] uppercase tracking-[0.1em] text-muted hover:text-name"
    >
      ↺ Reset to {to}
    </button>
  );
}

// A small −/value/+ stepper (sandbox scaffolding; the shipped one adopts a
// components/ui primitive). Clamped at the bounds; the override setter re-clamps.
function Stepper({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  ariaLabel: string;
}) {
  const btn =
    'grid h-6 w-[26px] place-items-center text-[14px] leading-none text-muted hover:bg-isk-hover-strong hover:text-isk disabled:cursor-default disabled:opacity-30 cursor-pointer';
  return (
    <span className="inline-flex items-center overflow-hidden rounded-[3px] border border-border bg-bg">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        aria-label={`Decrease ${ariaLabel}`}
        className={btn}
      >
        –
      </button>
      <span className="grid h-6 w-9 place-items-center border-x border-border-soft font-mono text-[12px] tabular-nums text-name">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_ME}
        aria-label={`Increase ${ariaLabel}`}
        className={btn}
      >
        +
      </button>
    </span>
  );
}

// The shared popover body (variants 1 & 2 + the main-BP header): the ME stepper,
// a subscript of the owned ME (so you can see your real level while overriding),
// and a Revert shown only when overridden. Owned / manual / unowned is ALSO read
// from the gem's colour, so no name or state text is needed.
function AdjustBody({ row, ctl }: { row: MockRow; ctl: Ctl }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">ME</span>
        <Stepper value={ctl.effective} onChange={ctl.setMe} ariaLabel={`${row.name} material efficiency`} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-[0.04em] text-faint">
          {ctl.owned !== undefined ? `owned ${ctl.owned}` : 'not owned'}
        </span>
        {ctl.isOverridden && (
          <button
            type="button"
            onClick={ctl.reset}
            className="inline-flex cursor-pointer items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] text-isk hover:text-name"
          >
            ↺ Revert
          </button>
        )}
      </div>
    </div>
  );
}

// An 11-tick ME scale (variant 4): the owned level is ringed, the filled run is
// tinted by state. Clicking a tick sets the override.
function MeScale({ ctl }: { ctl: Ctl }) {
  const fill =
    ctl.state === 'manual'
      ? 'bg-[var(--color-dps-mid)] border-[var(--color-dps-mid)]'
      : 'bg-evb-bright border-evb-border';
  return (
    <div className="flex items-center gap-[3px]">
      {Array.from({ length: MAX_ME + 1 }, (_, i) => {
        const active = i <= ctl.effective;
        const ownedTick = ctl.owned !== undefined && i === ctl.owned;
        return (
          <button
            key={i}
            type="button"
            onClick={() => ctl.setMe(i)}
            aria-label={`Set material efficiency ${i}`}
            className={cn(
              'h-5 w-[15px] cursor-pointer rounded-[2px] border transition-colors',
              active ? fill : 'border-border bg-bg hover:border-border-active',
              ownedTick && 'ring-1 ring-evb-bright ring-offset-1 ring-offset-section',
            )}
          />
        );
      })}
    </div>
  );
}

// The constant main-blueprint adjuster shown atop every variant (a T1 ship with
// no intermediate buildables has only this control). A pill → the shared popover.
function MainBpHeader({ ov }: { ov: Overrides }) {
  const ctl = ctlFor(ov, MAIN.bp);
  return (
    <div className="mb-2 flex items-center justify-between gap-3 px-1">
      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">
        Build plan
      </span>
      <Popover
        label="Main blueprint — set material efficiency"
        side="bottom"
        openOnHover={false}
        className="w-[184px]"
        triggerClassName={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border px-2 py-1 font-mono text-[10.5px] tabular-nums',
          pillClass(ctl.state),
        )}
        trigger={
          <>
            {MAIN.name} · ME {ctl.effective}
            <span className="text-[8px]">▾</span>
          </>
        }
      >
        <AdjustBody row={MAIN} ctl={ctl} />
      </Popover>
    </div>
  );
}

function Scaffold({ ov, children }: { ov: Overrides; children: ReactNode }) {
  return (
    <div>
      <MainBpHeader ov={ov} />
      <Card>{children}</Card>
    </div>
  );
}

// --- Variant 1 · corner orb → popover stepper ----------------------------
function RowOrb({ row, ctl }: { row: MockRow; ctl: Ctl }) {
  return (
    <div className={SBX_ROW}>
      <Popover
        label={`${row.name} — set material efficiency`}
        side="top"
        openOnHover={false}
        className="w-[184px]"
        triggerClassName="absolute left-0.5 top-0.5 z-10 h-[13px] w-[13px] cursor-pointer"
        trigger={<GemIcon state={ctl.state} />}
      >
        <AdjustBody row={row} ctl={ctl} />
      </Popover>
      <RowInner row={row} control={null} />
    </div>
  );
}

function VariantOrb() {
  const ov = useOverrides();
  return (
    <Scaffold ov={ov}>
      {ROWS.map((row) => (
        <RowOrb key={row.bp} row={row} ctl={ctlFor(ov, row.bp)} />
      ))}
    </Scaffold>
  );
}

// --- Variant 2 · inline value pill → popover stepper ---------------------
function RowPill({ row, ctl }: { row: MockRow; ctl: Ctl }) {
  return (
    <div className={SBX_ROW}>
      <RowInner
        row={row}
        control={
          <Popover
            label={`${row.name} — set material efficiency`}
            side="top"
            openOnHover={false}
            className="w-[184px]"
            triggerClassName={cn(
              'inline-flex cursor-pointer items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums',
              pillClass(ctl.state),
            )}
            trigger={
              <>
                ME {ctl.effective}
                <span className="text-[8px]">▾</span>
              </>
            }
          >
            <AdjustBody row={row} ctl={ctl} />
          </Popover>
        }
      />
    </div>
  );
}

function VariantPill() {
  const ov = useOverrides();
  return (
    <Scaffold ov={ov}>
      {ROWS.map((row) => (
        <RowPill key={row.bp} row={row} ctl={ctlFor(ov, row.bp)} />
      ))}
    </Scaffold>
  );
}

// --- Variant 3 · inline stepper, no popover ------------------------------
function RowInlineStepper({ row, ctl }: { row: MockRow; ctl: Ctl }) {
  return (
    <div className={SBX_ROW}>
      <RowInner
        row={row}
        control={
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-3 w-3 shrink-0">
              <GemIcon state={ctl.state} />
            </span>
            <Stepper
              value={ctl.effective}
              onChange={ctl.setMe}
              ariaLabel={`${row.name} material efficiency`}
            />
            {ctl.isOverridden && (
              <button
                type="button"
                onClick={ctl.reset}
                aria-label={`Reset ${row.name} material efficiency`}
                className="cursor-pointer font-mono text-[12px] text-muted hover:text-name"
              >
                ↺
              </button>
            )}
          </span>
        }
      />
    </div>
  );
}

function VariantInline() {
  const ov = useOverrides();
  return (
    <Scaffold ov={ov}>
      {ROWS.map((row) => (
        <RowInlineStepper key={row.bp} row={row} ctl={ctlFor(ov, row.bp)} />
      ))}
    </Scaffold>
  );
}

// --- Variant 4 · segmented 0–10 scale in a popover -----------------------
function RowScale({ row, ctl }: { row: MockRow; ctl: Ctl }) {
  return (
    <div className={SBX_ROW}>
      <RowInner
        row={row}
        control={
          <Popover
            label={`${row.name} — set material efficiency`}
            side="top"
            openOnHover={false}
            className="w-[264px]"
            triggerClassName={cn(
              'inline-flex cursor-pointer items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums',
              pillClass(ctl.state),
            )}
            trigger={
              <>
                ME {ctl.effective}
                <span className="text-[8px]">▾</span>
              </>
            }
          >
            <div className="flex items-baseline justify-between gap-3">
              <PopoverHeading>{row.name}</PopoverHeading>
              <StateTag state={ctl.state} />
            </div>
            <BaselineLine owned={ctl.owned} />
            <MeScale ctl={ctl} />
            <ResetButton ctl={ctl} />
          </Popover>
        }
      />
    </div>
  );
}

function VariantScale() {
  const ov = useOverrides();
  return (
    <Scaffold ov={ov}>
      {ROWS.map((row) => (
        <RowScale key={row.bp} row={row} ctl={ctlFor(ov, row.bp)} />
      ))}
    </Scaffold>
  );
}

// --- Variant 5 · expandable inline tune panel ----------------------------
function RowPanel({ row, ctl }: { row: MockRow; ctl: Ctl }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border-soft first:border-t-0">
      <div className={cn(SBX_ROW, 'border-t-0')}>
        <RowInner
          row={row}
          control={
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={`Adjust ${row.name} material efficiency`}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums',
                pillClass(ctl.state),
              )}
            >
              ME {ctl.effective}
              <span className={cn('text-[8px] transition-transform', open && 'rotate-180')}>▾</span>
            </button>
          }
        />
      </div>
      {open && (
        <div className="flex flex-col gap-2 bg-bg px-3 pb-3 pt-1">
          <div className="flex items-center justify-between gap-3">
            <BaselineLine owned={ctl.owned} />
            <StateTag state={ctl.state} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
              Material eff.
            </span>
            <Stepper
              value={ctl.effective}
              onChange={ctl.setMe}
              ariaLabel={`${row.name} material efficiency`}
            />
          </div>
          <ResetButton ctl={ctl} />
          <p className="font-mono text-[9.5px] leading-[1.5] text-muted">
            A manual value models a build beyond what you own — it never counts as an owned blueprint.
          </p>
        </div>
      )}
    </div>
  );
}

function VariantPanel() {
  const ov = useOverrides();
  return (
    <Scaffold ov={ov}>
      {ROWS.map((row) => (
        <RowPanel key={row.bp} row={row} ctl={ctlFor(ov, row.bp)} />
      ))}
    </Scaffold>
  );
}

// --- Gallery -------------------------------------------------------------
export function MeAdjusterDemo() {
  return (
    <>
      <VariantFrame
        tag="Variant 1"
        title="Corner gem → popover"
        notes="The corner orb made interactive, now EVE's material-efficiency gem (owned blue · manual orange · unowned faint outline). Click opens a popover with the ME stepper, a subscript of your owned ME, and a Revert (shown when overridden); owned/manual is also read from the gem's colour. The quietest treatment. TE will use EVE's hourglass in the next slice."
      >
        <VariantOrb />
      </VariantFrame>

      <VariantFrame
        tag="Variant 2"
        title="Inline value pill → popover"
        notes="A right-aligned ME pill shows the effective value at a glance, tinted by state; click opens the same stepper popover. More legible than the corner dot."
      >
        <VariantPill />
      </VariantFrame>

      <VariantFrame
        tag="Variant 3"
        title="Inline stepper (no popover)"
        notes="The − value + stepper sits directly on the row, with a state dot and a ↺ reset when overridden. Fastest to adjust, busiest at rest."
      >
        <VariantInline />
      </VariantFrame>

      <VariantFrame
        tag="Variant 4"
        title="Segmented 0–10 scale"
        notes="A pill opens a popover with an 11-tick ME dial — the owned level is ringed, the filled run tints blue (owned) or orange (manual). Click a tick to set. Most visual; reads ME as a scale."
      >
        <VariantScale />
      </VariantFrame>

      <VariantFrame
        tag="Variant 5"
        title="Expandable tune panel"
        notes="The pill expands a panel beneath the row with the stepper, baseline, reset, and an honesty note — roomy, and future-proofs the owner / TE / location rows the next slice adds."
      >
        <VariantPanel />
      </VariantFrame>
    </>
  );
}
