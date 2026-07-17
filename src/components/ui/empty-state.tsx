import type { ReactNode } from 'react';

/**
 * Renders the domain-neutral empty state with house behavior and tokens; callers own semantic
 * meaning and content while this primitive owns presentation.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="px-3.5 pt-2 pb-[9px] text-ui text-empty border-b border-border-soft">
      {children}
    </div>
  );
}
