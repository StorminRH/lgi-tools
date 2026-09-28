import type { ReactNode } from 'react';

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="px-3.5 pt-2 pb-[9px] text-ui text-empty border-b border-border-soft last:border-b-0">
      {children}
    </div>
  );
}
