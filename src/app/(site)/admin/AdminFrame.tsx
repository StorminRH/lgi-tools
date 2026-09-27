import { Suspense, type ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { SectionHead } from '@/components/ui/section-head';
import { AdminGate } from './AdminGate';
import { CardFallback } from './CardFallback';
import { RangeControl } from './RangeControl';

// The section head prerenders; everything under it waits on the admin gate.
export function AdminPageFrame({
  title,
  description,
  rangeBasePath,
  actions,
  fallbackLabel,
  children,
}: {
  title: string;
  description: ReactNode;
  rangeBasePath?: `/${string}`;
  actions?: ReactNode;
  fallbackLabel: string;
  children: ReactNode;
}) {
  return (
    <>
      <SectionHead
        title={title}
        description={description}
        meta={
          actions || rangeBasePath ? (
            <>
              {actions}
              {rangeBasePath ? <RangeControl basePath={rangeBasePath} /> : null}
            </>
          ) : undefined
        }
      />
      <Suspense fallback={<CardFallback label={fallbackLabel} rows={5} />}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </>
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
