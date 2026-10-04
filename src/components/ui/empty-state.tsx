import type { ReactNode } from 'react';
import { InboxIcon } from './icons';

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border-soft px-3.5 py-2.5 font-ui text-ui text-muted last:border-b-0">
      <InboxIcon size={16} className="shrink-0 text-faint" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
