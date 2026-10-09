import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * `chevron` adds the trailing ▾ that turns when the row opens (collapsible.css).
 * It is hidden from screen readers: the summary already announces its state.
 * It sits on the header's first text line, so a two-line ReadoutLine header
 * keeps its chevron level with the label and value.
 */
export function Collapsible({
  header,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  chevron = false,
  className,
  headerClassName,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  chevron?: boolean;
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
        {chevron ? (
          <span className="flex h-lh shrink-0 items-center self-start text-ui">
            <span data-chevron aria-hidden="true" className="inline-block text-micro text-muted transition-transform">
              ▾
            </span>
          </span>
        ) : null}
      </summary>
      <div>{children}</div>
    </details>
  );
}
