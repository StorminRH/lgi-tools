'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
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
  'rounded-ctl border border-transparent px-3 py-1 font-mono text-label tracking-label uppercase ' +
    'transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted',
  {
    variants: {
      tone: {
        green: '',
      } satisfies Record<SegmentedTone, string>,
      active: {
        true: '',
        false: 'text-muted hover:text-text',
      },
    },
    compoundVariants: [
      {
        tone: 'green',
        active: true,
        className: 'border-isk-dim bg-section text-isk shadow-btn-bezel',
      },
    ],
    defaultVariants: { tone: 'green', active: false },
  },
);

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
  href?: string;
}

const track =
  'inline-flex gap-0.5 rounded-ctl border border-border-soft bg-bg-deep p-[3px] shadow-field-inset';

export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  tone = 'green',
  className,
}: {
  options: readonly SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
  // Accessible name for the group. Required: the segments alone don't say what
  // is being chosen (the house rule — a control is never unnamed).
  label: string;
  tone?: SegmentedTone;
  className?: string;
}) {
  const linkMode = options.some((option) => option.href !== undefined);
  if (linkMode) {
    return (
      <div role="group" aria-label={label} className={cn(track, className)}>
        {options.map((option) => (
          <a
            key={option.value}
            href={option.href}
            aria-current={value === option.value ? 'page' : undefined}
            className={segment({ tone, active: value === option.value })}
          >
            {option.label}
          </a>
        ))}
      </div>
    );
  }

  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const selected = next[0];
        if (selected !== undefined) onChange?.(selected);
      }}
      aria-label={label}
      className={cn(track, className)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={segment({ tone, active: value === option.value })}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
