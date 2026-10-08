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
 * The dot is decorative and hidden from assistive technology. When its colour
 * carries a verdict, pass `label` so screen readers hear it as text beside it.
 */
export function Dot({
  tone,
  size = 'md',
  label,
  className,
}: {
  tone: DotTone;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}) {
  return (
    <>
      <span aria-hidden className={cn(dotVariants({ tone, size }), className)} />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
