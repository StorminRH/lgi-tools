import type { ReactNode } from 'react';
import { cn } from './cn';

export function SectionHead({
  title,
  leading,
  chips,
  description,
  meta,
  className,
}: {
  title: ReactNode;
  leading?: ReactNode;
  chips?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-section-head
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border-soft pb-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h2 className="font-display text-h2 font-bold uppercase leading-none tracking-optical text-name">
            {title}
          </h2>
          {chips != null && <span className="mt-1.5 flex items-center gap-[6px]">{chips}</span>}
          {description != null && <p className="mt-2 font-ui text-ui text-muted">{description}</p>}
        </div>
      </div>
      {meta != null && <div className="flex shrink-0 flex-wrap items-center gap-3">{meta}</div>}
    </header>
  );
}

/**
 * A section head for pages whose rail already names the section: the title
 * stays for screen readers only, and any meta (range selector, actions) sits
 * in a right-aligned tools row. Without meta it takes no space at all.
 *
 * `onTitleLine` lifts that row onto the page title's line from lg up, so the
 * first card starts level with the rail. The layout around the PageHead must
 * be `relative`; the row spans one line of --text-title.
 */
export function QuietSectionHead({
  title,
  meta,
  onTitleLine = false,
}: {
  title: string;
  meta?: ReactNode;
  onTitleLine?: boolean;
}) {
  return (
    <header
      data-section-head
      className={
        meta == null
          ? 'contents'
          : cn(
              'flex flex-wrap items-center justify-end gap-3',
              onTitleLine && 'lg:absolute lg:top-0 lg:right-0 lg:h-[length:var(--text-title)]',
            )
      }
    >
      <h2 className="sr-only">{title}</h2>
      {meta}
    </header>
  );
}
