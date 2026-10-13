import type { ReactNode } from 'react';
import { cn } from './cn';
import { Popover } from './popover';

/** The (?) mark that opens on hover or tap and explains the figure beside it. */
export function HelpPopover({
  label,
  keepSide,
  attention = false,
  className,
  children,
}: {
  label: string;
  /** The help's content grows while open. */
  keepSide?: boolean;
  /** Something inside wants a look: the mark turns amber. */
  attention?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Popover
      keepSide={keepSide}
      className={className}
      label={label}
      trigger="?"
      triggerClassName={cn(
        'inline-flex h-[15px] w-[15px] cursor-help items-center justify-center rounded-full border bg-bg-deep/60 text-micro font-bold',
        attention
          ? 'border-dps-mid/60 text-dps-mid hover:border-dps-mid'
          : 'border-border-idle text-muted hover:border-isk-dim hover:text-isk',
      )}
    >
      {children}
    </Popover>
  );
}
