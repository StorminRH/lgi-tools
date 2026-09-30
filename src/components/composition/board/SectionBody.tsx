import type { ReactNode } from 'react';
import { cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { SectionHeader } from '@/components/ui/section-header';
import type { BoardSection } from '@/composition/board/api-contract';

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
