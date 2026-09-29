import type { ReactNode } from 'react';
import { cn } from './cn';
import { PageTitle } from './page-head';

/** The page title at the top of a sheet's context column, with a line on what the page is for. */
export function SheetHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <PageTitle size="compact">{title}</PageTitle>
      {children !== undefined && <p className="text-ui text-muted">{children}</p>}
    </header>
  );
}

/**
 * A sheet: a context column (identity, setup, filters) beside the working
 * area. Below xl the context column stacks on top.
 */
export function SheetLayout({
  aside,
  children,
  className,
}: {
  aside: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid items-start gap-x-10 gap-y-6 xl:grid-cols-[18.75rem_minmax(0,1fr)]',
        className,
      )}
    >
      <div className="reveal reveal-1 flex min-w-0 flex-col gap-5">{aside}</div>
      <div className="reveal reveal-2 flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
