'use client';

import type { ReactNode } from 'react';
import { serverStatusPresentation } from '@/components/composition/server-status-presentation';
import { StatusDot } from '@/components/ui/status-dot';
import { Pill } from '@/components/ui/pill';
import { useClientCommitted } from '@/lib/use-client-committed';
import type { ServerStatus as ServerStatusValue } from '@/data/eve-status/types';

const STATUS_PILL_CLASS =
  'h-full gap-2 whitespace-nowrap border-transparent bg-transparent px-3 uppercase tracking-label';

export function ServerStatus({ status }: { status: ServerStatusValue }) {
  const { label, ariaLabel, reachable } = serverStatusPresentation(status);
  return (
    <span aria-label={ariaLabel} className="h-full">
      <Pill
        tone={reachable ? 'green' : 'neutral'}
        className={`${STATUS_PILL_CLASS} ${reachable ? '' : 'text-muted'}`}
      >
        <StatusDot state={status.state} />
        {label}
      </Pill>
    </span>
  );
}

export function ServerStatusFallback() {
  return (
    <span aria-label="Loading server status" className="h-full">
      <Pill tone="neutral" className={`${STATUS_PILL_CLASS} text-muted`}>
        <StatusDot state="offline" />
        TQ · …
      </Pill>
    </span>
  );
}

export function HeldServerStatus({ children }: { children: ReactNode }) {
  return useClientCommitted() ? children : <ServerStatusFallback />;
}
