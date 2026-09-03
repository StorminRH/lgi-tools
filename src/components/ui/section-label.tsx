import type { ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

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
        className={eyebrow({
          weight: 'semibold',
          emphasis: 'strong',
          className: 'inline-flex items-baseline gap-2',
        })}
      >
        {prefix && <span className="text-isk tracking-normal">{'//'}</span>}

        {children}
      </span>

      {meta}
    </div>

  );
}
