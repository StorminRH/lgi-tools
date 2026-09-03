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
        'flex items-center gap-3 px-6 py-3 border-t border-border text-micro',
        className,
      )}
    >
      <div className="flex-1 min-w-0">{left}</div>
      {center && <div className="shrink-0">{center}</div>}
      <div className="flex-1 min-w-0 text-right">{right}</div>
    </footer>
  );
}
