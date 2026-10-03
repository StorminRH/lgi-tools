import type { ReactNode } from 'react';
import { Collapsible } from '@/components/ui/collapsible';
import { Dot } from '@/components/ui/dot';
import { type ShareSegment, SlimShareBar } from '@/components/ui/stacked-share-bar';
import type { SubsystemStatus } from '@/data/telemetry/health-metrics';
import { LEVEL_DOT_TONE } from '../status-tone';

export function StatusRow({
  name,
  status,
  share,
  children,
}: {
  name: string;
  status: SubsystemStatus;
  /** Optional split shown under the header so the mix is visible while collapsed. */
  share?: ShareSegment[];
  children: ReactNode;
}) {
  return (
    <Collapsible
      header={
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-1">
          <span className="flex min-w-0 items-center gap-3">
            <Dot tone={LEVEL_DOT_TONE[status.level]} size="lg" />
            <span className="w-[110px] shrink-0 font-data text-ui text-name">{name}</span>
            <span className="truncate font-data text-ui text-muted">{status.headline}</span>
            <span
              data-chevron
              className="ml-auto inline-block shrink-0 text-micro text-muted transition-transform"
            >
              ▾
            </span>
          </span>
          {share && (
            <SlimShareBar
              segments={share}
              ariaLabel={`${name} runs: ${share.map((s) => `${s.value} ${s.label}`).join(', ')}`}
              className="ml-5"
            />
          )}
        </span>
      }
    >
      {children}
    </Collapsible>
  );
}
