import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';
import type { PillTone } from './tones';

export type { PillTone };

export const pillToneClasses = {
  neutral:      'pill-soft border-transparent [--pill-tone:var(--color-muted)] text-text',
  green:        'pill-soft border-transparent [--pill-tone:var(--color-isk)] text-isk',
  'green-strong':'pill-soft border-transparent [--pill-tone:var(--color-tone-green-strong)] text-tone-green-strong',
  orange:       'pill-soft border-transparent [--pill-tone:var(--color-tone-orange)] text-tone-orange',
  'orange-soft':'pill-soft border-transparent [--pill-tone:var(--color-tone-orange-soft)] text-tone-orange-soft',
  red:          'pill-soft border-transparent [--pill-tone:var(--color-alert-red)] text-pill-red-text',
  'red-soft':   'pill-soft border-transparent [--pill-tone:var(--color-tone-red-soft)] text-tone-red-soft',
  magenta:      'pill-soft border-transparent [--pill-tone:var(--color-tone-magenta)] text-tone-magenta',
  purple:       'pill-soft border-transparent [--pill-tone:var(--color-tone-purple)] text-tone-purple',
  yellow:       'pill-soft border-transparent [--pill-tone:var(--color-tone-yellow)] text-tone-yellow',
  teal:         'pill-soft border-transparent [--pill-tone:var(--color-tone-teal)] text-tone-teal',
  blue:         'pill-soft border-transparent [--pill-tone:var(--color-tone-blue)] text-tone-blue',
} satisfies Record<PillTone, string>;

const pillVariants = cva(
  'font-ui font-semibold border inline-flex items-center gap-1.5',
  {
    variants: {
      tone: pillToneClasses,
      size: {
        sm: 'text-ui px-[9px] py-[2px] rounded-full',
        md: 'text-ui px-[11px] py-[3px] rounded-full',
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
