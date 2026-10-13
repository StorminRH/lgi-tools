import type { ComponentProps, ReactNode } from 'react';
import { Card, cardSurface } from './card';
import { cn } from './cn';
import { SectionHeader } from './section-header';

// A titled panel shrinks inside its grid track and clips its header bar and
// rows to the card's rounded corners.
const readoutClip = 'min-w-0 overflow-hidden';

/** The card glass for a readout tile that has no header bar of its own. */
export const readoutSurface = cn(cardSurface, readoutClip);

/**
 * A titled card: the card glass topped by the medium header bar. `meta` sits
 * at the right of the bar. `titleAs` makes the title a real heading for the
 * page outline; it is a plain span by default.
 */
export function SectionPanel({
  title,
  meta,
  titleAs,
  className,
  children,
  ...rest
}: {
  title: ReactNode;
  meta?: ReactNode;
  titleAs?: ComponentProps<typeof SectionHeader>['as'];
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<'section'>, 'title' | 'className' | 'children' | 'ref'>) {
  return (
    <Card as="section" {...rest} className={cn(readoutClip, className)}>
      <SectionHeader size="md" as={titleAs} label={title} hint={meta} />
      {children}
    </Card>
  );
}
