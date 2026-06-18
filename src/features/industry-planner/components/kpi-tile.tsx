import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

// Shared chrome for the Cockpit KPI tile row (`.kpi` in the handoff). A bordered
// section-bg panel with an optional 2px top accent and a fixed min height; the
// label sits at the top and the figure + sub cluster drop to the bottom. Lives in
// its own module so both CockpitKpis and the (score) MarketScorePanel can use it
// without a circular import (CockpitKpis renders MarketScorePanel).

export const KPI_FIG = 'mt-2.5 text-[25px] font-semibold leading-[1.02] tabular-nums';
export const KPI_SUB = 'mt-1.5 font-body text-[10px] leading-[1.45] text-muted text-pretty';
const KPI_LABEL = 'font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted';

export function KpiTile({
  accent,
  span2,
  children,
}: {
  accent?: 'green' | 'blue';
  span2?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[104px] flex-col rounded-md border border-border bg-section px-[15px] pb-[13px] pt-[14px]',
        accent === 'green' && 'border-t-2 border-t-isk-dim',
        accent === 'blue' && 'border-t-2 border-t-evb-border',
        span2 && 'col-span-2',
      )}
    >
      {children}
    </div>
  );
}

// The label row. `mb-auto` pushes the figure + sub to the bottom of the tile.
export function KpiHead({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="mb-auto flex items-center justify-between gap-1.5">
      <span className={KPI_LABEL}>{label}</span>
      {right}
    </div>
  );
}

// A plain value tile (Input cost / Sell / Build time). Net margin and Market Score
// compose KpiTile directly because they carry extra controls.
export function SimpleTile({
  label,
  accent,
  value,
  valueClass,
  sub,
}: {
  label: string;
  accent?: 'green' | 'blue';
  value: ReactNode;
  valueClass?: string;
  sub: ReactNode;
}) {
  return (
    <KpiTile accent={accent}>
      <KpiHead label={label} />
      <div className={cn(KPI_FIG, valueClass)}>{value}</div>
      <div className={KPI_SUB}>{sub}</div>
    </KpiTile>
  );
}
