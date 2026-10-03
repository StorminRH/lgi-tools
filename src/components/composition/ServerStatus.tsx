'use client';

import type { ReactNode } from 'react';
import { serverStatusPresentation } from '@/components/composition/server-status-presentation';
import { cn } from '@/components/ui/cn';
import { navigationMenuLink } from '@/components/ui/navigation-menu';
import { Popover } from '@/components/ui/popover';
import { StatusDot } from '@/components/ui/status-dot';
import { useClientCommitted } from '@/lib/use-client-committed';
import type { ServerStatus as ServerStatusValue } from '@/data/eve-status/types';

/** Reads as plain header text, set like the tool tabs beside it. */
const STATUS_TEXT_CLASS = cn(navigationMenuLink(), 'gap-2');

function StatusText({ state, value }: { state: ServerStatusValue['state']; value: string }) {
  return (
    <>
      <StatusDot state={state} />
      TQ
      <span className="tabular-nums text-text">{value}</span>
    </>
  );
}

/** Tranquility at a glance; the rest of EVE's status opens from it. */
export function ServerStatus({
  status,
  children,
}: {
  status: ServerStatusValue;
  children?: ReactNode;
}) {
  const { value, ariaLabel } = serverStatusPresentation(status);
  return (
    <Popover
      label={ariaLabel}
      align="end"
      triggerClassName={STATUS_TEXT_CLASS}
      trigger={<StatusText state={status.state} value={value} />}
    >
      {children}
    </Popover>
  );
}

export function ServerStatusFallback() {
  return (
    <span aria-label="Loading server status" className={STATUS_TEXT_CLASS}>
      <StatusText state="offline" value="…" />
    </span>
  );
}

export function HeldServerStatus({ children }: { children: ReactNode }) {
  return useClientCommitted() ? children : <ServerStatusFallback />;
}
