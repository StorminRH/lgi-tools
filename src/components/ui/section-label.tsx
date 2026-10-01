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
      <span className="inline-flex items-baseline gap-2 font-ui text-ui font-semibold text-text">
        {prefix && <span className="text-isk">{'//'}</span>}
        {children}
      </span>
      {meta}
    </div>
  );
}
