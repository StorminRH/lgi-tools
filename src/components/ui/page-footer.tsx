import type { ReactNode } from 'react';
import { cn } from './cn';

export function PageFooter({
  left,
  center,
  right,
  className,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <footer
      data-site-footer
      className={cn(
        'mx-3 mb-3 mt-6 flex items-center gap-3 rounded-card border border-border glass-surface px-6 py-3 text-micro max-md:flex-col max-md:items-start',
        className,
      )}
    >
      <div className="flex-1 min-w-0">{left}</div>
      {center && <div className="shrink-0">{center}</div>}
      <div className="flex-1 min-w-0 text-right max-md:text-left">{right}</div>
    </footer>
  );
}
