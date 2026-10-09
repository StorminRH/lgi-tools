import type { ReactNode } from 'react';
import { SectionHeader } from '@/components/ui/section-header';

/**
 * A titled block inside a card body, such as one chart or table among
 * several. `padded` insets it like a card row when it sits straight in the
 * card rather than in a body that already pads its content.
 */
export function TitledBlock({
  title,
  padded = false,
  children,
}: {
  title: string;
  padded?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={padded ? 'px-3.5 py-3' : undefined}>
      <SectionHeader variant="sub" label={title} className="mb-2" />
      {children}
    </div>
  );
}
