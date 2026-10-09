import { Suspense, type ReactNode } from 'react';
import { LoadingLabel } from '@/components/ui/loading-label';
import { QuietSectionHead } from '@/components/ui/section-head';
import { AdminGate } from './AdminGate';
import { CardFallback } from './CardFallback';
import { RangeControl } from './RangeControl';

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
          onTitleLine
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
