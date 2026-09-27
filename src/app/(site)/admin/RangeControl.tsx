import { Suspense } from 'react';
import { RangeSelector, RangeSelectorFallback } from './RangeSelector';

export type RangeSearchParams = Promise<{ range?: string | string[] }>;

// The selector reads the URL on the client, so its hole stays tiny and the
// section head around it prerenders.
export function RangeControl({ basePath }: { basePath: `/${string}` }) {
  return (
    <Suspense fallback={<RangeSelectorFallback basePath={basePath} />}>
      <RangeSelector basePath={basePath} />
    </Suspense>
  );
}
