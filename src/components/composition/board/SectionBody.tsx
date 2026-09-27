import type { ReactNode } from 'react';
import { cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionHeader } from '@/components/ui/section-header';
import type { BoardSection } from '@/composition/board/api-contract';
import { formatRelativeTime } from '@/lib/format/time';

/** The glass the sheet's readouts sit on; everything else floats on the backdrop. */
export const readoutSurface = cn(cardSurface, 'min-w-0 overflow-hidden');

export function SectionPanel({
  title,
  meta,
  className,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(readoutSurface, className)}>
      <SectionHeader label={title} hint={meta} size="md" />
      {children}
    </section>
  );
}

export function updatedLabel(section: BoardSection<unknown>, now: number): string | null {
  return section.state === 'ready' ? `updated ${formatRelativeTime(new Date(section.refreshedAt), now)}` : null;
}

/**
 * Ready renders the content. Pending is a quiet line, not a skeleton: the
 * board reconciles once, so a shimmer could run forever. Reconnect points at
 * the one reconnect sentence above the sheet instead of repeating its button.
 */
export function SectionBody<T>({
  section,
  children,
}: {
  section: BoardSection<T>;
  children: (data: T) => ReactNode;
}) {
  if (section.state === 'ready') return children(section.data);
  return (
    <p className="px-3.5 py-3 text-ui text-faint">
      {section.state === 'pending' ? 'Syncing from EVE…' : 'Needs a reconnect to sync.'}
    </p>
  );
}
