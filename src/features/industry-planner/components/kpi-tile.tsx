import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { Popover } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';

export const KPI_FIG = 'mt-2.5 font-data text-stat font-semibold leading-[1.02] tabular-nums';
const KPI_LABEL = 'text-label font-semibold uppercase tracking-wide text-muted';

export function KpiTile({
  span2,
  children,
}: {
  span2?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        'flex flex-col px-[15px] pb-[13px] pt-[14px]',
        span2 && 'col-span-2',
      )}
    >
      {children}
    </Card>
  );
}

export function KpiHelp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover
      label={label}
      trigger="?"
      triggerClassName="inline-flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border border-border-idle bg-bg text-micro font-bold text-muted hover:border-isk-dim hover:text-isk"
    >
      {children}
    </Popover>
  );
}

export function KpiHead({ label, right }: { label: string; right?: ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-1.5">
      <span className={KPI_LABEL}>{label}</span>
      {right}
    </div>
  );
}

export function SimpleTile({
  label,
  value,
  valueClass,
  right,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  right?: ReactNode;
}) {
  return (
    <KpiTile>
      <KpiHead label={label} right={right} />
      <div className={cn(KPI_FIG, valueClass)}>{value}</div>
    </KpiTile>
  );
}
