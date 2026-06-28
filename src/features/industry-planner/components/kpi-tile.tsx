import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Popover } from '@/components/ui/popover';

// Shared chrome for the Cockpit KPI tile row (`.kpi` in the handoff). A bordered
// section-bg panel with a uniform border (no per-tile accent) sized to its
// content — the label sits at the top with the figure directly beneath it. Lives
// in its own module so both CockpitKpis and the (score) MarketScorePanel can use
// it without a circular import (CockpitKpis renders MarketScorePanel).

export const KPI_FIG = 'mt-2.5 text-[25px] font-semibold leading-[1.02] tabular-nums';
const KPI_LABEL = 'font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted';

export function KpiTile({
  span2,
  children,
}: {
  span2?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-md border border-border bg-section px-[15px] pb-[13px] pt-[14px]',
        span2 && 'col-span-2',
      )}
    >
      {children}
    </div>
  );
}

// The "?" help affordance in a KPI tile header: a small dot whose hover (or
// focus) reveals an explanation panel. Shared by the Market Score, Build time,
// and Net margin tiles so the trigger chrome is defined once.
export function KpiHelp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover
      label={label}
      trigger="?"
      triggerClassName="inline-flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border border-border-idle bg-bg font-mono text-[9px] font-bold text-muted hover:border-isk-dim hover:text-isk"
    >
      {children}
    </Popover>
  );
}

// The label row. The figure sits directly beneath it (KPI_FIG's own top margin
// is the only gap), so the tile is as short as its content.
export function KpiHead({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-1.5">
      <span className={KPI_LABEL}>{label}</span>
      {right}
    </div>
  );
}

// A plain value tile (Input cost / Sell / Build time). Net margin and Market Score
// compose KpiTile directly because they carry extra controls.
export function SimpleTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <KpiTile>
      <KpiHead label={label} />
      <div className={cn(KPI_FIG, valueClass)}>{value}</div>
    </KpiTile>
  );
}
