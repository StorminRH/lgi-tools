import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';
import type { PillTone } from './tones';

export type { PillTone };

export const pillToneClasses = {
  neutral:      'bg-surface-raised text-text border-border-idle',
  green:        'bg-pill-green-bg text-isk border-isk-dim',
  'green-strong':'bg-pill-green-bg text-tone-green-strong border-isk-dim',
  orange:       'bg-pill-orange-bg text-tone-orange border-pill-orange-border',
  'orange-soft':'bg-pill-orange-soft-bg text-tone-orange-soft border-pill-orange-soft-border',
  red:          'bg-pill-red-bg text-pill-red-text border-pill-red-border',
  'red-soft':   'bg-pill-red-soft-bg text-tone-red-soft border-pill-red-soft-border',
  magenta:      'bg-pill-magenta-bg text-tone-magenta border-pill-magenta-border',
  purple:       'bg-pill-purple-bg text-tone-purple border-pill-purple-border',
  yellow:       'bg-pill-yellow-bg text-tone-yellow border-pill-yellow-border',
  teal:         'bg-pill-teal-bg text-tone-teal border-pill-teal-border',
  blue:         'bg-surface-sunk text-tone-blue border-pill-blue-border',
} satisfies Record<PillTone, string>;

const pillVariants = cva(
  'font-data font-semibold border inline-flex items-center',
  {
    variants: {
      tone: pillToneClasses,
      size: {
        sm: 'text-ui px-[8px] py-[3px] tracking-copy rounded-ctl',
        md: 'text-ui px-[9px] py-[3px] tracking-[0.05em] rounded-ctl',
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
