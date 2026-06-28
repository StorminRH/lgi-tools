'use client';

import { cn } from '@/components/ui/cn';
import { Popover } from '@/components/ui/popover';
import { Stepper } from '@/components/ui/stepper';
import { effectiveMeOf, MAX_ME, nodeMeState, type NodeMeState } from '../me-overrides';
import type { OwnedComponentDetail } from '../types';

// The interactive per-node material-efficiency control (3.7.5.4). A buildable
// node's owned-or-overridden ME, surfaced as EVE's material-efficiency gem: blue
// when owned, orange when manually overridden, a faint outline when unowned. The
// gem opens a small popover — the ME stepper, a subscript of the owned level, and
// a Revert (only when overridden). Owned/manual is read from the gem's colour, so
// the popover carries no extra text beyond the owned-blueprint readout (3.7.5.5):
// for an owned node it also lists that blueprint's TE / owner / location. A TE
// *adjuster* (EVE's hourglass) is a later slice; TE here is a readout only.

interface MeProps {
  // The producing blueprint's type id — the key the override map and `meOf` use.
  blueprintTypeId: number;
  // For the trigger/popover accessible name.
  name: string;
  ownedMe: Map<number, number> | null;
  meOverrides: Map<number, number>;
  setMeOverride: (blueprintTypeId: number, me: number) => void;
  resetMeOverride: (blueprintTypeId: number) => void;
  // The owned copy's TE / owner / location readout, when this node is owned. Absent
  // for unowned / manual-only nodes → the popover stays ME-only.
  detail?: OwnedComponentDetail;
}

// Derive a node's display state from the owned + override maps through the shared
// helpers, so the gem and the engine ledger always agree on the effective ME.
function derive(ownedMe: Map<number, number> | null, meOverrides: Map<number, number>, bp: number) {
  const owned = ownedMe?.get(bp);
  const override = meOverrides.get(bp);
  return {
    owned,
    effective: effectiveMeOf(ownedMe, meOverrides)(bp) ?? 0,
    state: nodeMeState(owned, override),
    isOverridden: override !== undefined,
  };
}

// EVE's material-efficiency gem. Filled + glowing when a level is set (owned blue
// / manual orange), a faint outline when unowned. Sized by its container. Exported
// so the UX sandbox renders the same glyph (one source, no duplicate).
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
  const fill = state === 'manual' ? 'fill-[var(--color-dps-mid)]' : 'fill-evb-bright';
  const glow =
    state === 'manual'
      ? 'drop-shadow-[0_0_4px_var(--color-dps-mid)]'
      : 'drop-shadow-[0_0_4px_var(--color-evb-glow)]';
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

// A label/value readout row in the orb popover (the owned-blueprint detail). Mono,
// to match the ME row above it; the value wraps for long station names.
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="break-words text-right font-mono text-[10px] tracking-[0.04em] text-faint">{value}</span>
    </div>
  );
}

// The shared popover body: the ME stepper, an owned-ME subscript, and a Revert
// (shown only when overridden, in ISK-green so it reads as an action). For an owned
// node it also lists the owned blueprint's TE / owner / location (readout only).
function MePopoverBody({
  name,
  owned,
  effective,
  isOverridden,
  setMe,
  reset,
  detail,
}: {
  name: string;
  owned: number | undefined;
  effective: number;
  isOverridden: boolean;
  setMe: (n: number) => void;
  reset: () => void;
  detail?: OwnedComponentDetail;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">ME</span>
        <Stepper value={effective} onChange={setMe} min={0} max={MAX_ME} ariaLabel={`${name} material efficiency`} />
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
      {detail && (
        <div className="flex flex-col gap-1 border-t border-border-soft pt-1.5">
          <DetailRow label="TE" value={`${detail.te}%`} />
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
      )}
    </div>
  );
}

// The corner gem orb for a build-plan tier row. Pinned top-left of the row; opens
// the adjuster popover. `faded` dims it with a focus-dimmed row.
export function MeRowOrb({
  blueprintTypeId,
  name,
  ownedMe,
  meOverrides,
  setMeOverride,
  resetMeOverride,
  detail,
  faded,
}: MeProps & { faded?: boolean }) {
  const d = derive(ownedMe, meOverrides, blueprintTypeId);
  return (
    <Popover
      label={`${name} — set material efficiency`}
      side="top"
      openOnHover={false}
      className="w-[184px]"
      triggerClassName={cn(
        'absolute left-0.5 top-0.5 z-10 h-[13px] w-[13px] cursor-pointer transition-opacity',
        faded && 'opacity-25',
      )}
      trigger={<GemIcon state={d.state} />}
    >
      <MePopoverBody
        name={name}
        owned={d.owned}
        effective={d.effective}
        isOverridden={d.isOverridden}
        setMe={(n) => setMeOverride(blueprintTypeId, n)}
        reset={() => resetMeOverride(blueprintTypeId)}
        detail={detail}
      />
    </Popover>
  );
}

function pillToneClass(state: NodeMeState): string {
  if (state === 'manual') return 'border-[var(--color-dps-mid)] text-[var(--color-dps-mid)]';
  if (state === 'owned') return 'border-evb-border text-evb-bright';
  return 'border-border text-muted';
}

// The main-blueprint control for the build-plan header (a product with no
// intermediate buildables — a T1 ship — has only this). A gem + "ME N" pill
// opening the same adjuster popover.
export function MeMainControl({
  blueprintTypeId,
  ownedMe,
  meOverrides,
  setMeOverride,
  resetMeOverride,
  detail,
}: Omit<MeProps, 'name'>) {
  const d = derive(ownedMe, meOverrides, blueprintTypeId);
  return (
    <Popover
      label="Main blueprint — set material efficiency"
      side="bottom"
      openOnHover={false}
      className="w-[184px]"
      triggerClassName={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]',
        pillToneClass(d.state),
      )}
      trigger={
        <>
          <span className="inline-flex h-3 w-3 shrink-0">
            <GemIcon state={d.state} />
          </span>
          ME {d.effective}
          <span className="text-[8px]">▾</span>
        </>
      }
    >
      <MePopoverBody
        name="main blueprint"
        owned={d.owned}
        effective={d.effective}
        isOverridden={d.isOverridden}
        setMe={(n) => setMeOverride(blueprintTypeId, n)}
        reset={() => resetMeOverride(blueprintTypeId)}
        detail={detail}
      />
    </Popover>
  );
}
