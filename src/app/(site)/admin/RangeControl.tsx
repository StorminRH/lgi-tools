import { Suspense } from 'react';
import { RangeSelector, RangeSelectorFallback } from './RangeSelector';

export type RangeSearchParams = Promise<{ range?: string | string[] }>;

export function RangeControl({ basePath }: { basePath: `/${string}` }) {
  return (
    <Suspense fallback={<RangeSelectorFallback basePath={basePath} />}>
      <RangeSelector basePath={basePath} />
    </Suspense>
  );
}
