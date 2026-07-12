'use client';

import { NumberField } from '@base-ui/react/number-field';
import { cn } from './cn';

// A compact −/[value]/+ integer stepper with a typeable middle field, on Base UI's
// NumberField. Domain-agnostic: the caller owns the value and is handed each
// committed number through `onChange`. NumberField owns the editing model — you can
// clear and retype mid-edit, valid input commits as you type, and on blur it formats
// and CLAMPS to [min, max] (empty blur snaps to `min`). Both buttons clamp, so they
// no-op at the bounds rather than overshoot. `max` omitted = no upper bound (the
// runs case). Integer-only via a zero-fraction format; Alt-/Shift-step stay whole.
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  className?: string;
}) {
  const btn =
    'h-7 w-[26px] text-ui leading-none text-muted hover:bg-isk-hover-strong hover:text-isk cursor-pointer';
  return (
    <NumberField.Root
      value={value}
      // Empty-blur emits null; snap it to the floor so the committed value stays a
      // number (the field's own text can briefly read empty until the next edit).
      onValueChange={(next) => onChange(next ?? min)}
      min={min}
      max={max}
      step={1}
      smallStep={1}
      largeStep={10}
      format={{ maximumFractionDigits: 0 }}
      className={cn('inline-flex', className)}
    >
      <NumberField.Group className="inline-flex items-center overflow-hidden rounded-ctl border border-border bg-bg">
        <NumberField.Decrement aria-label={`Decrease ${ariaLabel}`} className={btn}>
          –
        </NumberField.Decrement>
        <NumberField.Input
          aria-label={ariaLabel}
          className="h-7 w-12 border-x border-border-soft bg-transparent text-center font-mono text-ui text-name outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <NumberField.Increment aria-label={`Increase ${ariaLabel}`} className={btn}>
          +
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  );
}
