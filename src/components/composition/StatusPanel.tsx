import type { ReactNode } from 'react';
import { cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';

/**
 * The centred glass card behind the route error and 404 states. The title
 * stack is a plain div: the site header stays the page's only header.
 */
export function StatusPanel({
  eyebrow,
  title,
  children,
  meta,
  actions,
}: {
  eyebrow: string;
  title: string;
  /** Body copy under the title. */
  children?: ReactNode;
  /** Extra detail under the body, such as an incident reference. */
  meta?: ReactNode;
  /** The buttons and links row. */
  actions: ReactNode;
}) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-20">
      <div className={cn(cardSurface, 'reveal flex w-full max-w-[720px] flex-col items-center gap-8 rounded-panel px-6 py-12 text-center sm:px-12')}>
        <div className="flex flex-col items-center gap-3 max-w-[640px]">
          <div className="font-data text-label text-muted tracking-eyebrow uppercase">
            {eyebrow}
          </div>
          <h1 className="font-display font-bold text-hero leading-none tracking-copy uppercase text-name">
            {title}
          </h1>
          {children ? <p className="text-body text-text leading-relaxed">{children}</p> : null}
          {meta}
        </div>

        <div className="flex items-center gap-3">{actions}</div>
      </div>
    </div>
  );
}
