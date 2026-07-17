import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The ONE place the shared outer page frame lives (3.6.11 F1). Every page wraps
 * its content in <PageShell>; the max-width + horizontal gutters are identical on
 * every route so the layout width never jumps on navigation. Pages differ only by
 * their INNER content width, set inside the shell — prose centers a narrow reading
 * column, dashboards/tables fill the frame. The dot-lattice backdrop shows through
 * wherever inner content is narrower than the frame; that is intended, not empty
 * space to fill. Purely presentational (no data reads), so it stays out of the
 * static/partial-prerender determination — wrapping a page tree in it never flips
 * a route's render mode.
 */
export function PageShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('w-full max-w-[1280px] mx-auto px-7', className)}>
      {children}
    </div>
  );
}
