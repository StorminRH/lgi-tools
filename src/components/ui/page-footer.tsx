import type { ReactNode } from 'react';
import { cn } from './cn';

// Domain-agnostic page footer. Three slots: `left` / `center` / `right`.
// Mirrors `page-header.tsx`'s left/right pattern but adds an optional
// center slot — the application footer's right corner is reserved for the
// floating `<FeedbackButton>`, so version / changelog links sit in the
// middle to avoid collision.
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
      className={cn(
        'flex items-center gap-3 px-6 py-3 border-t border-[#1e2535] text-[9px]',
        className,
      )}
    >
      <div className="flex-1 min-w-0">{left}</div>
      {center && <div className="shrink-0">{center}</div>}
      <div className="flex-1 min-w-0 text-right">{right}</div>
    </footer>
  );
}
