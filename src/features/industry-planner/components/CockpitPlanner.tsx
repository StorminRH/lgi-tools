'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { TypeIcon } from '@/components/ui/type-icon';
import { formatQuantity } from '@/lib/format/number';
import { MANUFACTURING_ACTIVITY_ID } from '../build-pricing';
import { activityLabel } from '../industry-styles';
import type { BlueprintStructure } from '../types';
import { BuildLocationSelector } from './BuildLocationSelector';
import { CockpitBuildPlan } from './CockpitBuildPlan';
import { CockpitKpis, type MarginMode } from './CockpitKpis';
import { CockpitLedger } from './CockpitLedger';
import { usePricing } from './PricingProvider';

// The Cockpit planner body for /industry/[id] — the redesigned dashboard that
// replaces the legacy hero + multi-view build plan. It reads the live pricing
// store (runs, location, margin, score, rows) and lays the product economics out
// as: a page head + identity bar (here), a KPI tile row, a profit ledger, and a
// consolidated tier build plan. Built section by section; this file owns the
// page head and the identity bar.

// Runs stepper: minus / numeric input / plus. The input is a controlled string so
// the field can be cleared and retyped mid-edit; it commits only on a whole
// number >= 1 and snaps back to the committed value on blur. Mirrors the legacy
// RunsField, with -/+ buttons added.
function RunsStepper({ runs, setRuns }: { runs: number; setRuns: (n: number) => void }) {
  const [draft, setDraft] = useState(String(runs));
  const commit = (raw: string) => {
    setDraft(raw);
    const n = Number(raw);
    if (raw !== '' && Number.isInteger(n) && n >= 1) setRuns(n);
  };
  const step = (delta: number) => {
    const next = Math.max(1, runs + delta);
    setRuns(next);
    setDraft(String(next));
  };
  const btn =
    'w-[26px] h-7 text-[14px] leading-none text-muted hover:text-isk hover:bg-[rgba(61,214,140,0.06)] cursor-pointer';
  return (
    <span className="inline-flex items-center overflow-hidden rounded-[3px] border border-border bg-bg">
      <button type="button" onClick={() => step(-1)} aria-label="Decrease runs" className={btn}>
        –
      </button>
      <input
        type="number"
        min={1}
        step={1}
        value={draft}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setDraft(String(runs))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
        aria-label="Runs"
        className="h-7 w-12 border-x border-border-soft bg-transparent text-center font-mono text-[12px] text-name outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => step(1)} aria-label="Increase runs" className={btn}>
        +
      </button>
    </span>
  );
}

// lgi://industry / <name> breadcrumb + a terse right-aligned stat strip. The
// crumb's `industry` segment links back to the planner index (replacing the old
// back link); the current product name is the bright tail.
function PlannerHead({ name, group }: { name: string; group: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-[26px] pb-1">
      <div className="font-mono text-caption tracking-[0.08em] text-muted">
        <span className="text-isk">lgi://</span>
        <Link href="/industry" className="hover:text-isk">
          industry
        </Link>
        <span className="mx-1.5 text-border-active">/</span>
        <span className="text-name">{name.toLowerCase()}</span>
      </div>
      {group && (
        <div className="inline-flex items-baseline gap-[18px] pb-0.5 font-mono text-caption uppercase tracking-[0.08em] text-muted">
          <span>{group}</span>
          <span>
            jita <span className="font-semibold text-isk">live</span>
          </span>
        </div>
      )}
    </header>
  );
}

export function CockpitPlanner({ structure }: { structure: BlueprintStructure }) {
  const { runs, setRuns } = usePricing();
  // Gross/Net is the user's preference, gated by an available net estimate. Lives
  // here so the KPI margin tile and the profit ledger share one source of truth.
  const [marginMode, setMarginMode] = useState<MarginMode>('net');
  const group = structure.buildNodeDisplay[structure.product.typeId]?.label ?? '';
  const isManufacturing = structure.activityId === MANUFACTURING_ACTIVITY_ID;
  const outputUnits = structure.product.quantityPerRun * runs;

  return (
    <>
      <PlannerHead name={structure.product.name} group={group} />

      <div
        className={cn(
          'mb-3.5 mt-3.5 flex flex-wrap items-center gap-3.5',
          'rounded-md border border-border bg-section px-[18px] py-4',
        )}
      >
        <TypeIcon
          typeId={structure.product.typeId}
          variant="render"
          size={52}
          alt={structure.product.name}
          mono={structure.product.name.slice(0, 2)}
        />
        <div className="min-w-0">
          <div className="font-display text-[25px] font-bold uppercase leading-none tracking-[0.01em] text-name">
            {structure.product.name}
          </div>
          <div className="mt-[5px] font-body text-[11px] leading-[1.4] text-muted">
            {group ? `${group} · ` : ''}builds {formatQuantity(outputUnits)} unit
            {outputUnits === 1 ? '' : 's'}
          </div>
        </div>
        <Pill tone="blue">{activityLabel(structure.activityId)}</Pill>

        <div className="flex-1" />

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2.5 text-[9px] uppercase tracking-[0.14em] text-muted">
            Runs
            <RunsStepper runs={runs} setRuns={setRuns} />
          </label>
          {isManufacturing && (
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted">Build at</span>
              <BuildLocationSelector blueprintId={structure.blueprintTypeId} />
            </div>
          )}
        </div>
      </div>

      <CockpitKpis structure={structure} marginMode={marginMode} setMarginMode={setMarginMode} />
      <CockpitLedger structure={structure} marginMode={marginMode} />
      <CockpitBuildPlan structure={structure} />
    </>
  );
}
