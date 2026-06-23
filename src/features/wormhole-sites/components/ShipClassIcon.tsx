import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import type { SleeperClassCode } from '../schema';

// Chevron-rank glyphs for the Sleeper hull classes, following the EVE overview
// convention: the frigate is a single down-chevron, the heavier hulls are stacked
// up-chevrons (cruiser two, battleship three), and the sentry is a square. Drawn
// as inline SVG so they stay crisp at any size and take the hostile-red token via
// `currentColor`. Only F/C/B/T are mapped — the codes our Sleeper data carries.
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

function isKnownClass(code: string): code is SleeperClassCode {
  return Object.prototype.hasOwnProperty.call(CLASS_GLYPH, code);
}

/**
 * A red chevron-rank glyph for a Sleeper hull class, keyed by the F/C/B/T code.
 * Decorative (the class label / NPC name always sits beside it). Renders nothing
 * for a code outside the known set, so an unexpected value never shows a stray
 * mark.
 */
export function ShipClassIcon({
  code,
  size = 18,
  className,
}: {
  code: string;
  size?: number;
  className?: string;
}) {
  if (!isKnownClass(code)) return null;
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
