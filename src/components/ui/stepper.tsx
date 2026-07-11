'use client';

import { useState } from 'react';
import { cn } from './cn';
import { clampStep, commitStepperValue } from './stepper-math';

// A compact −/[value]/+ numeric stepper with a typeable middle field. Domain-
// agnostic: the caller owns the value and is handed each committed number through
// `onChange`. The field is a controlled string so it can be cleared and retyped
// mid-edit; it commits only on a whole number within [min, max] and snaps back to
// the committed value on blur. `max` omitted = no upper bound (the runs case).
// Both buttons clamp to the bounds, so they no-op rather than overshoot.
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
  const [draft, setDraft] = useState(String(value));
  // Reflect external value changes (e.g. a revert / programmatic reset) in the
  // field without an effect — the React "adjust state during render" sync, tracking
  // the last value we rendered. A no-op when the change came from this stepper.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(String(value));
  }

  const commit = (raw: string) => {
    setDraft(raw);
    const n = commitStepperValue(raw, { min, max });
    if (n !== null) onChange(n);
  };
  const step = (delta: number) => {
    const next = clampStep(value, delta, { min, max });
    onChange(next);
    setDraft(String(next));
  };
  const btn =
    'h-7 w-[26px] text-[14px] leading-none text-muted hover:bg-isk-hover-strong hover:text-isk cursor-pointer';
  return (
    <span
      className={cn(
        'inline-flex items-center overflow-hidden rounded-[3px] border border-border bg-bg',
        className,
      )}
    >
      <button type="button" onClick={() => step(-1)} aria-label={`Decrease ${ariaLabel}`} className={btn}>
        –
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setDraft(String(value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
        aria-label={ariaLabel}
        className="h-7 w-12 border-x border-border-soft bg-transparent text-center font-mono text-[12px] text-name outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => step(1)} aria-label={`Increase ${ariaLabel}`} className={btn}>
        +
      </button>
    </span>
  );
}
