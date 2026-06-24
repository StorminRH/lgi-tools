import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * A pure-HTML <details>/<summary> collapsible. No client component
 * required — browsers toggle open/closed natively, the chevron rotates
 * via a CSS rule in globals.css (`details[open] [data-chevron]`).
 */
export function Collapsible({
  header,
  children,
  defaultOpen = false,
  className,
  headerClassName,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <details
      open={defaultOpen}
      data-collapsible
      className={cn('border-b border-border-soft last:border-b-0 group', className)}
    >
      <summary
        className={cn(
          'w-full flex justify-between items-center gap-2 px-3.5 py-[7px] cursor-pointer select-none hover:bg-row-hover list-none [&::-webkit-details-marker]:hidden',
          headerClassName,
        )}
      >
        {header}
      </summary>
      <div>{children}</div>
    </details>
  );
}
