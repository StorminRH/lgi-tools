import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import type { BoardSection } from '@/composition/board/api-contract';

/**
 * The quiet line a board or workspace panel shows in place of its rows: why
 * there is nothing yet, or what to do about it. `divided` rules it off from
 * content above it in the same panel; `alert` marks a state that needs the
 * pilot's attention.
 */
export function SectionNote({
  children,
  divided = false,
  tone = 'quiet',
}: {
  children: ReactNode;
  divided?: boolean;
  tone?: 'quiet' | 'alert';
}) {
  return (
    <p
      className={cn(
        'px-3.5 py-3 text-ui',
        tone === 'alert' ? 'text-dps-high' : 'text-faint',
        divided && 'border-t border-border-soft',
      )}
    >
      {children}
    </p>
  );
}

export function SectionBody<T>({
  section,
  children,
}: {
  section: BoardSection<T>;
  children: (data: T) => ReactNode;
}) {
  if (section.state === 'ready') return children(section.data);
  return <SectionNote>{section.state === 'pending' ? 'Syncing from EVE…' : 'Needs a reconnect to sync.'}</SectionNote>;
}
