import type { ReactNode } from 'react';
import { cn } from './cn';

// Domain-agnostic page header. Slot-based: callers pass `left` / `right`
// nodes; this component owns only the strip's layout + spacing. Mirrors
// `page-footer.tsx` — keep the shapes symmetric.
export function PageHeader({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-3 px-6 py-3 text-body',
        className,
      )}
    >
      <div className="min-w-0">{left}</div>
      <div className="shrink-0">{right}</div>
    </header>
  );
}
