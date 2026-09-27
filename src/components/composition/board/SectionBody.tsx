import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { SectionHeader } from '@/components/ui/section-header';
import type { BoardSection } from '@/composition/board/api-contract';
import { formatRelativeTime } from '@/lib/format/time';

/** Panel chrome shared by every sheet section. */
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
    <section className={cn('min-w-0 overflow-hidden rounded-card border border-border-soft bg-bg-deep/40', className)}>
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
