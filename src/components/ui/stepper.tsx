'use client';

import { NumberField } from '@base-ui/react/number-field';
import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * A compact −/[value]/+ integer stepper with a typeable middle field, on Base UI's
 * NumberField. Domain-agnostic: the caller owns the value and is handed each
 * committed number through `onChange`. NumberField owns the editing model — you can
 * clear and retype mid-edit, valid input commits as you type, and on blur it formats
 * and CLAMPS to [min, max] (empty blur snaps to `min`). Both buttons clamp, so they
 * no-op at the bounds rather than overshoot. `max` omitted = no upper bound (the
 * runs case). Integer-only via a zero-fraction format; Alt-/Shift-step stay whole.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  ariaLabel,
  variant = 'default',
  trailing,
  reserveTrailing = false,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  variant?: 'default' | 'inline';
  trailing?: ReactNode;
  reserveTrailing?: boolean;
  className?: string;
}) {
  const inline = variant === 'inline';
  const btn = inline
    ? "relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-ctl text-micro leading-none text-muted hover:bg-isk-hover-strong hover:text-isk cursor-pointer after:absolute after:-inset-1 after:content-['']"
    : 'h-7 w-[26px] text-ui leading-none text-muted hover:bg-isk-hover-strong hover:text-isk cursor-pointer';
  return (
    <NumberField.Root
      value={value}
      // Live-commit typed and stepped numbers, but SKIP the transient null Base UI
      // emits while the field is being cleared — coercing that to min here would
      // repopulate the field before the user types a replacement (breaking the
      // clear-and-retype flow).
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      // On blur/commit an empty field settles to the floor; a committed number passes
      // straight through. (Only commit — never a mid-edit change — reaches here.)
      onValueCommitted={(next) => onChange(next ?? min)}
      min={min}
      max={max}
      step={1}
      smallStep={1}
      largeStep={10}
      format={{ maximumFractionDigits: 0 }}
      className={cn(
        'inline-flex items-center',
        (trailing != null || reserveTrailing) && 'gap-1',
        className,
      )}
    >
      <NumberField.Group
        className={cn(
          'inline-flex items-center',
          !inline && 'overflow-hidden rounded-ctl border border-border bg-bg',
        )}
      >
        <NumberField.Decrement aria-label={`Decrease ${ariaLabel}`} className={btn}>
          {inline ? '▼' : '–'}
        </NumberField.Decrement>
        <NumberField.Input
          aria-label={ariaLabel}
          className={cn(
            'bg-transparent text-center font-data text-ui text-name outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            inline
              ? 'w-[22px] tabular-nums'
              : 'h-7 w-12 border-x border-border-soft focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-isk-sub',
          )}
        />
        <NumberField.Increment aria-label={`Increase ${ariaLabel}`} className={btn}>
          {inline ? '▲' : '+'}
        </NumberField.Increment>
      </NumberField.Group>
      {(trailing != null || reserveTrailing) && (
        <span className="inline-flex w-3.5 shrink-0 items-center justify-center">
          {trailing}
        </span>
      )}
    </NumberField.Root>
  );
}
