import { serverStatusPresentation } from '@/components/composition/server-status-presentation';
import { StatusDot } from '@/components/ui/status-dot';
import { Pill } from '@/components/ui/pill';
import type { ServerStatus as ServerStatusValue } from '@/data/eve-status/types';

export function ServerStatus({ status }: { status: ServerStatusValue }) {
  const { label, ariaLabel, reachable } = serverStatusPresentation(status);
  return (
    <span aria-label={ariaLabel} className="h-full">
      <Pill
        tone={reachable ? 'green' : 'neutral'}
        className={`h-full gap-2 whitespace-nowrap border-transparent bg-transparent px-3 uppercase tracking-label ${
          reachable ? '' : 'text-muted'
        }`}
      >
        <StatusDot state={status.state} />
        {label}
      </Pill>
    </span>
  );
}
