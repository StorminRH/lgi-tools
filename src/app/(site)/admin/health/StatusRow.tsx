import type { ReactNode } from 'react';
import { levelReadout } from '@/components/status-level-tone';
import { Collapsible } from '@/components/ui/collapsible';
import { ReadoutLine } from '@/components/ui/readout';
import { type ShareSegment, SlimShareBar } from '@/components/ui/stacked-share-bar';
import type { SubsystemStatus } from '@/data/telemetry/health-metrics';

/** A status line that opens onto its detail, laid out like the overview's status rows. */
export function StatusRow({
  label,
  status,
  share,
  children,
}: {
  label: string;
  status: SubsystemStatus;
  /** Optional split shown under the line so the mix is visible while collapsed. */
  share?: ShareSegment[];
  children: ReactNode;
}) {
  const line = <ReadoutLine label={label} value={status.value} note={status.note} {...levelReadout(status.level)} />;
  return (
    <Collapsible
      chevron
      headerClassName="py-2.5"
      header={
        share === undefined ? (
          line
        ) : (
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            {line}
            {/* Indented past the dot, under the label. */}
            <SlimShareBar
              segments={share}
              ariaLabel={`${label} runs: ${share.map((s) => `${s.value} ${s.label}`).join(', ')}`}
              className="ml-5"
            />
          </span>
        )
      }
    >
      {children}
    </Collapsible>
  );
}
