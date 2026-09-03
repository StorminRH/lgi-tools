import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { isSleeperClassCode, type SleeperClassCode } from '../schema';

const CLASS_GLYPH: Record<SleeperClassCode, ReactNode> = {
  F: <polyline points="3,6 8,10.5 13,6" />,
  C: (
    <>
      <polyline points="3,7.5 8,4 13,7.5" />
      <polyline points="3,11.5 8,8 13,11.5" />
    </>
  ),
  B: (
    <>
      <polyline points="3,6 8,3 13,6" />
      <polyline points="3,9 8,6 13,9" />
      <polyline points="3,12 8,9 13,12" />
    </>
  ),
  T: <rect x="3.5" y="3.5" width="9" height="9" />,
};

export function ShipClassIcon({
  code,
  size = 18,
  className,
}: {
  code: string;
  size?: number;
  className?: string;
}) {
  if (!isSleeperClassCode(code)) return null;
  return (
    <svg
      className={cn('text-hostile shrink-0', className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CLASS_GLYPH[code]}
    </svg>
  );
}
