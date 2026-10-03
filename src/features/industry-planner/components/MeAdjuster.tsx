'use client';

import { useCallback, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Stepper } from '@/components/ui/stepper';
import { EFFICIENCY_TONE_CLASSES } from '../industry-styles';
import { effectiveMeOf, MAX_ME, nodeMeState, type NodeMeState } from '../me-overrides';
import { MAX_TE } from '../te-overrides';
import type { OwnedComponentDetail } from '../types';
import { IndustryGlyph } from './IndustryGlyph';

export interface MeProps {
  blueprintTypeId: number;
  name: string;
  ownedMe: Map<number, number> | null;
  meOverrides: Map<number, number>;
  setMeOverride: (blueprintTypeId: number, me: number) => void;
  resetMeOverride: (blueprintTypeId: number) => void;
}

export interface TeProps {
  blueprintTypeId: number;
  name: string;
  ownedTe: Map<number, number> | null;
  teOverrides: Map<number, number>;
  setTeOverride: (blueprintTypeId: number, te: number) => void;
  resetTeOverride: (blueprintTypeId: number) => void;
}

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

export type IconState = NodeMeState | 'bonus' | 'reaction';

/** CCP's glyph in its efficiency tone. The glow sits on a wrapper because a mask clips its own element's filter. */
function ToneGlyph({ glyph, state }: { glyph: 'me' | 'te'; state: IconState }) {
  const tone = EFFICIENCY_TONE_CLASSES[state];
  return (
    <span aria-hidden className={cn('block size-full', tone.glow)}>
      <IndustryGlyph glyph={glyph} className={tone.text} />
    </span>
  );
}

export function GemIcon({ state }: { state: IconState }) {
  return <ToneGlyph glyph="me" state={state} />;
}

export function HourglassIcon({ state }: { state: IconState }) {
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

type Derived = ReturnType<typeof deriveAdjust>;

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
      className="cursor-pointer text-ui leading-none text-isk hover:text-name"
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
        valueClassName={EFFICIENCY_TONE_CLASSES[d.state].text}
      />
    </span>
  );
}

export function MeField({ blueprintTypeId, name, ownedMe, meOverrides, setMeOverride, resetMeOverride, boxed }: MeProps & { boxed?: boolean }) {
  const d = deriveAdjust(ownedMe, meOverrides, blueprintTypeId);
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
      boxed={boxed}
    />
  );
}

export function TeField({ blueprintTypeId, name, ownedTe, teOverrides, setTeOverride, resetTeOverride, boxed }: TeProps & { boxed?: boolean }) {
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
      boxed={boxed}
    />
  );
}

function AdjusterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="text-label uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

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
        />
      </AdjusterRow>
    </div>
  );
}
