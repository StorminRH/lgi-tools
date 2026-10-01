import { Suspense, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { LoadingLabel } from '@/components/ui/loading-label';
import { QuietSectionHead } from '@/components/ui/section-head';
import { AdminGate } from './AdminGate';
import { CardFallback } from './CardFallback';
import { RangeControl } from './RangeControl';

// From lg up the page's tools (range selector, actions) sit on the "Admin"
// title line, so the first card lines up with the top of the rail. The layout
// is the positioning context; the title box is one line of --text-title.
const ADMIN_TOOLS_ON_TITLE_LINE = 'lg:absolute lg:top-0 lg:right-0 lg:h-[length:var(--text-title)]';

export function AdminPageFrame({
  title,
  rangeBasePath,
  actions,
  fallbackLabel,
  children,
}: {
  title: string;
  rangeBasePath?: `/${string}`;
  actions?: ReactNode;
  fallbackLabel: string;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<LoadingLabel />}>
      <AdminGate>
        <QuietSectionHead
          title={title}
          className={ADMIN_TOOLS_ON_TITLE_LINE}
          meta={
            actions || rangeBasePath ? (
              <>
                {actions}
                {rangeBasePath ? <RangeControl basePath={rangeBasePath} /> : null}
              </>
            ) : undefined
          }
        />
        <Suspense fallback={<CardFallback label={fallbackLabel} rows={5} />}>{children}</Suspense>
      </AdminGate>
    </Suspense>
  );
}

// One streamed card with its own skeleton and staggered entrance.
export function AdminSlot({
  label,
  rows = 3,
  reveal,
  className,
  children,
}: {
  label: string;
  rows?: number;
  reveal: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('reveal', `reveal-${reveal}`, className)}>
      <Suspense fallback={<CardFallback label={label} rows={rows} />}>{children}</Suspense>
    </div>
  );
}
