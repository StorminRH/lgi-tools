import type { ReactNode } from 'react';
import { Collapsible } from '@/components/ui/collapsible';
import { Dot } from '@/components/ui/dot';
import type { StatusLevel, SubsystemStatus } from '@/data/telemetry/health-metrics';

const DOT_TONE: Record<StatusLevel, 'green' | 'orange' | 'red' | 'neutral'> = {
  green: 'green',
  amber: 'orange',
  red: 'red',
  neutral: 'neutral',
};

export function StatusRow({
  name,
  status,
  children,
}: {
  name: string;
  status: SubsystemStatus;
  children?: ReactNode;
}) {
  const header = (
    <span className="flex items-center gap-3 min-w-0 flex-1 py-1">
      <Dot tone={DOT_TONE[status.level]} size="lg" />
      <span className="font-data text-ui text-name w-[110px] shrink-0">{name}</span>

      <span className="font-data text-ui text-muted truncate">{status.headline}</span>

      {children && (
        <span
          data-chevron
          className="ml-auto text-micro text-muted transition-transform inline-block shrink-0"
        >
          ▾
        </span>

      )}
    </span>

  );
  if (!children) {
    return (
      <div className="border-b border-border-soft last:border-b-0 px-3.5 py-[7px]">
        {header}
      </div>

    );
  }
  return (
    <Collapsible header={header}>
      {children}
    </Collapsible>

  );
}
