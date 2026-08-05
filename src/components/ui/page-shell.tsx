import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The ONE place the shared outer page frame lives (3.6.11 F1). Every page wraps
 * its content in <PageShell>; the max-width + horizontal gutters are identical on
 * every route so the layout width never jumps on navigation. Pages differ only by
 * their INNER content width, set inside the shell — prose centers a narrow reading
 * column, dashboards/tables fill the frame. The space backdrop shows through
 * wherever inner content is narrower than the frame; that is intended, not empty
 * space to fill. Purely presentational (no data reads), so it stays out of the
 * static/partial-prerender determination — wrapping a page tree in it never flips
 * a route's render mode.
 */
export function PageShell({
  mode,
  className,
  children,
}: {
  mode: 'workspace' | 'reading' | 'detail';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-page-shell
      data-page-shell-mode={mode}
      className="mx-auto w-full max-w-frame px-7 pb-region"
    >
      <div
        data-page-shell-content
        className={cn(
          mode === 'reading' && 'mx-auto max-w-reading',
          mode === 'detail' && 'pt-region',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
