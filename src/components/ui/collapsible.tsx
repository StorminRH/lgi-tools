import type { ReactNode } from 'react';
import { cn } from './cn';

export function Collapsible({
  header,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  headerClassName,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  headerClassName?: string;
}) {
  return (
    <details
      open={open ?? defaultOpen}
      onToggle={onOpenChange ? (event) => onOpenChange(event.currentTarget.open) : undefined}
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
