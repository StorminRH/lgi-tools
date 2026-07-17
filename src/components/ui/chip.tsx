import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { ChipTone } from './tones';

export type { ChipTone };

const chipVariants = cva(
  'inline-flex items-center font-mono text-label font-semibold px-[5px] py-px rounded-ctl tracking-label uppercase border leading-[1.5] shrink-0',
  {
    variants: {
      tone: {
        blue:   'bg-chip-blue-bg text-chip-blue border-chip-blue-border',
        red:    'bg-chip-red-bg text-chip-red border-chip-red-border',
        purple: 'bg-chip-purple-bg text-chip-purple border-chip-purple-border',
        green:  'bg-chip-green-bg text-chip-green border-chip-green-border',
        orange: 'bg-chip-orange-bg text-dps-mid border-chip-orange-border',
      } satisfies Record<ChipTone, string>,
    },
  },
);

/**
 * Renders the domain-neutral chip with house behavior and tokens; callers own semantic meaning and
 * content while this primitive owns presentation.
 */
export function Chip({
  tone,
  children,
  className,
}: {
  // Required — Chip is a deliberate subset of the tone vocabulary (tones.ts).
  tone: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(chipVariants({ tone }), className)}>{children}</span>;
}
