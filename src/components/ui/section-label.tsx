import type { ReactNode } from 'react';
import { cn } from './cn';

export function SectionLabel({
  children,
  meta,
  prefix = true,
  className,
}: {
  children: ReactNode;
  meta?: ReactNode;
  prefix?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-baseline gap-2', meta != null && 'justify-between', className)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-2 font-ui text-ui font-semibold text-text',
          prefix &&
            "before:h-0.5 before:w-3.5 before:shrink-0 before:rounded-full before:bg-brand-gradient before:content-['']",
        )}
      >
        {children}
      </span>
      {meta}
    </div>
  );
}
