'use client';

import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { Tone } from './tones';

// One exclusive value-chooser as a compact button group — the /sites view/detail
// toggles' look (aria-pressed segments, active pill highlight), lifted into a
// primitive now that the account menu is a second surface rendering the same
// affordance. Controlled: the caller owns the value (usePreference, state, …).

export type SegmentedTone = Extract<Tone, 'green'>;

// Abstract tone → active-segment token classes, the menu.tsx single-tone cva
// pattern; add a richer tone when a real second consumer needs one.
const segment = cva(
  'font-mono text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors',
  {
    variants: {
      tone: {
        green: '',
      } satisfies Record<SegmentedTone, string>,
      active: {
        true: '',
        false: 'text-muted hover:text-name',
      },
    },
    compoundVariants: [{ tone: 'green', active: true, className: 'text-isk bg-pill-green-bg' }],
    defaultVariants: { tone: 'green', active: false },
  },
);

export function Segmented({
  options,
  value,
  onChange,
  label,
  tone = 'green',
  className,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  // Accessible name for the group. Required: the segments alone don't say what
  // is being chosen (the house rule — a control is never unnamed).
  label: string;
  tone?: SegmentedTone;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex border border-border-idle rounded-[3px] overflow-hidden', className)}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={segment({ tone, active: value === option })}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
