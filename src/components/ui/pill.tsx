import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';
import type { PillTone } from './tones';

export type { PillTone };

// Two sizes: 'sm' (default) matches the dense wireframe card-meta spec —
// 9px / 600 / 4px tracking. 'md' is the clickable-affordance size used by
// the FilterBar and any other interactive pill consumer that needs more
// click target + readability.
const pillVariants = cva(
  'font-mono font-semibold rounded-[2px] border inline-flex items-center',
  {
    variants: {
      tone: {
        neutral:      'bg-surface-raised text-muted border-border-idle',
        green:        'bg-pill-green-bg text-isk border-isk-dim',
        'green-strong':'bg-pill-green-bg text-tone-green-strong border-isk-dim',
        orange:       'bg-pill-orange-bg text-tone-orange border-pill-orange-border',
        'orange-soft':'bg-pill-orange-soft-bg text-tone-orange-soft border-pill-orange-soft-border',
        red:          'bg-pill-red-bg text-tone-red border-pill-red-border',
        'red-soft':   'bg-pill-red-soft-bg text-tone-red-soft border-pill-red-soft-border',
        magenta:      'bg-pill-magenta-bg text-tone-magenta border-pill-magenta-border',
        purple:       'bg-pill-purple-bg text-tone-purple border-pill-purple-border',
        yellow:       'bg-pill-yellow-bg text-tone-yellow border-pill-yellow-border',
        teal:         'bg-pill-teal-bg text-tone-teal border-pill-teal-border',
        blue:         'bg-surface-sunk text-tone-blue border-pill-blue-border',
      } satisfies Record<PillTone, string>,
      size: {
        sm: 'text-[9px] px-[6px] py-[2px] tracking-[0.04em]',
        md: 'text-[11px] px-[9px] py-[3px] tracking-[0.05em]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

export function Pill({
  tone,
  size,
  children,
  className,
}: VariantProps<typeof pillVariants> & {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(pillVariants({ tone, size }), className)}>{children}</span>;
}
