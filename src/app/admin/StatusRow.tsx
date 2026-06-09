import type { ReactNode } from 'react';
import { Collapsible } from '@/components/ui/collapsible';
import type { StatusLevel, SubsystemStatus } from '@/data/telemetry/health-metrics';

// One subsystem line in the status strip: colored dot + name + plain-English
// headline, with the detail charts collapsed underneath (<details>, so no
// client state). Green/amber/red are reserved for status here and on KPI
// deltas; charts elsewhere stay blue.

const DOT_CLASS: Record<StatusLevel, string> = {
  green: 'bg-isk',
  amber: 'bg-tone-orange',
  red: 'bg-tone-red',
  neutral: 'bg-muted',
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
  return (
    <Collapsible
      header={
        <span className="flex items-center gap-3 min-w-0 flex-1 py-1">
          <span
            aria-hidden
            className={`size-2 rounded-full shrink-0 ${DOT_CLASS[status.level]}`}
          />
          <span className="font-mono text-[12px] text-name w-[110px] shrink-0">{name}</span>
          <span className="font-mono text-[12px] text-muted truncate">{status.headline}</span>
          <span
            data-chevron
            className="ml-auto text-[10px] text-muted transition-transform inline-block shrink-0"
          >
            ▾
          </span>
        </span>
      }
    >
      {children}
    </Collapsible>
  );
}
