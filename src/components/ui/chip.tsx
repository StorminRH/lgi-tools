import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { ChipTone } from './tones';

export type { ChipTone };

export const chipVariants = cva(
  'pill-soft inline-flex items-center gap-1.5 px-[9px] py-px rounded-full border border-transparent leading-[1.5] shrink-0 ' +
    'font-ui text-ui font-semibold',
  {
    variants: {
      tone: {
        blue:   '[--pill-tone:var(--color-chip-blue)] text-chip-blue',
        red:    '[--pill-tone:var(--color-chip-red)] text-chip-red',
        purple: '[--pill-tone:var(--color-chip-purple)] text-chip-purple',
        green:  '[--pill-tone:var(--color-chip-green)] text-chip-green',
        orange: '[--pill-tone:var(--color-dps-mid)] text-dps-mid',
      } satisfies Record<ChipTone, string>,
    },
  },
);

export function Chip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(chipVariants({ tone }), className)}>{children}</span>;
}
