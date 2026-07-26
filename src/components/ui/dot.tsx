import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { DotTone } from './tones';

export type { DotTone };

const dotVariants = cva('inline-block rounded-full shrink-0', {
  variants: {
    tone: {
      orange: 'bg-tone-orange-soft shadow-dot-orange',
      blue:   'bg-tone-blue shadow-dot-blue',
      green: 'bg-isk',
      red: 'bg-tone-red',
      neutral: 'bg-muted',
    } satisfies Record<DotTone, string>,
    size: {
      sm: 'size-[5px]',
      md: 'size-[6px]',
      lg: 'size-2',
    },
  },
  compoundVariants: [
    {
      tone: 'orange',
      size: 'sm',
      className: 'bg-tone-orange shadow-none',
    },
  ],
  defaultVariants: { size: 'md' },
});

/**
 * Renders the domain-neutral dot with house behavior and tokens; callers own semantic meaning and
 * content while this primitive owns presentation.
 */
export function Dot({
  tone,
  size = 'md',
  className,
}: {
  tone: DotTone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return <span aria-hidden className={cn(dotVariants({ tone, size }), className)} />;
}
