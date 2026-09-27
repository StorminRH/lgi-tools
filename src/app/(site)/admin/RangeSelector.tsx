'use client';

import { useSearchParams } from 'next/navigation';
import { SegmentedControl } from '@/components/ui/segmented';
import { parseRange, RANGES } from '@/composition/admin-period';
import { rangeHref } from './admin-sections';

function RangeLinks({ basePath, value }: { basePath: `/${string}`; value: string }) {
  return (
    <SegmentedControl
      label="Reporting range"
      value={value}
      options={RANGES.map((option) => ({
        value: option,
        label: option === 'all' ? 'All' : option,
        href: rangeHref(basePath, option),
      }))}
    />
  );
}

export function RangeSelector({ basePath }: { basePath: `/${string}` }) {
  return <RangeLinks basePath={basePath} value={parseRange(useSearchParams().get('range') ?? undefined)} />;
}

export function RangeSelectorFallback({ basePath }: { basePath: `/${string}` }) {
  return <RangeLinks basePath={basePath} value="" />;
}
