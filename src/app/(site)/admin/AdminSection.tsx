import { Suspense, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { CardFallback } from './CardFallback';
import { loadSection, SECTION_LOAD_FAILED } from './load-section';

/** The frame every admin card shares: one heading, an optional hint, the card's body. */
export function AdminCard({
  title,
  name,
  hint,
  anchor,
  className,
  children,
}: {
  /** The card's heading, and the label of its skeleton and unavailable states. */
  title: string;
  /** A stable hook for tests: rendered as `data-admin-card`. */
  name: string;
  /** Links or a figure at the right of the header. */
  hint?: ReactNode;
  /** An in-page anchor target, such as `scheduled` for `#scheduled`. */
  anchor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      data-admin-card={name}
      id={anchor}
      className={cn('overflow-hidden', anchor !== undefined && 'scroll-mt-24', className)}
    >
      <SectionHeader size="md" as="h3" label={title} hint={hint} />
      {children}
    </Card>
  );
}

type AdminCardFrame = Omit<Parameters<typeof AdminCard>[0], 'children'>;

interface LoadedCardProps<T> {
  frame: AdminCardFrame;
  load: () => Promise<T>;
  hint?: ReactNode | ((data: T) => ReactNode);
  children: (data: T) => ReactNode;
}

async function LoadedCard<T>({ frame, load, hint, children }: LoadedCardProps<T>) {
  const data = await loadSection(frame.name, load);
  if (data === SECTION_LOAD_FAILED) {
    return (
      <AdminCard {...frame}>
        <EmptyState kind="unavailable">Unable to load this section.</EmptyState>
      </AdminCard>
    );
  }
  return (
    <AdminCard {...frame} hint={typeof hint === 'function' ? hint(data) : hint}>
      {children(data)}
    </AdminCard>
  );
}

/**
 * One streamed admin card. Its title names the skeleton, the header and the
 * unavailable state, so they cannot drift apart, and its read is caught on
 * its own: a failed read blanks this card and leaves the rest of the page.
 * Cards that need the same data share a request-cached read (see
 * `shared-reads.ts`) rather than one card rendering several.
 */
export function AdminSection<T>({
  reveal,
  rows = 3,
  slotClassName,
  load,
  hint,
  children,
  ...frame
}: Omit<Parameters<typeof AdminCard>[0], 'hint' | 'children'> & {
  reveal: 1 | 2 | 3 | 4 | 5 | 6;
  /** Skeleton rows shown while the read is in flight. */
  rows?: number;
  slotClassName?: string;
  load: () => Promise<T>;
  hint?: ReactNode | ((data: T) => ReactNode);
  children: (data: T) => ReactNode;
}) {
  return (
    <div className={cn('reveal', `reveal-${reveal}`, slotClassName)}>
      <Suspense fallback={<CardFallback label={frame.title} rows={rows} className={frame.className} />}>
        <LoadedCard frame={frame} load={load} hint={hint}>
          {children}
        </LoadedCard>
      </Suspense>
    </div>
  );
}
