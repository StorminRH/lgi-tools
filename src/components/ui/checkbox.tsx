'use client';

import { Checkbox as Base } from '@base-ui/react/checkbox';
import { cva } from 'class-variance-authority';
import { ChoiceRow, type ChoiceLabel } from './choice-row';
import { cn } from './cn';
import { CheckIcon } from './icons';
import type { Tone } from './tones';

export type CheckboxTone = Extract<Tone, 'green' | 'neutral' | 'red'>;

const box = cva(
  'check-soft inline-flex size-5 shrink-0 cursor-pointer items-center justify-center outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-isk-sub data-disabled:cursor-not-allowed',
  {
    variants: {
      tone: {
        green: '[--check-tone:var(--color-isk)] [--check-ink:var(--color-isk-bright)]',
        neutral: '[--check-tone:var(--color-text)] [--check-ink:var(--color-name)]',
        red: '[--check-tone:var(--color-alert-red)] [--check-ink:var(--color-chip-red)]',
      } satisfies Record<CheckboxTone, string>,
    },
    defaultVariants: { tone: 'green' },
  },
);

/** A checkbox, bare under an aria-label or inside a visible label row (see ChoiceLabel). */
export function Checkbox({
  checked,
  onCheckedChange,
  tone = 'green',
  disabled,
  className,
  ...name
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  tone?: CheckboxTone;
  disabled?: boolean;
  className?: string;
} & ChoiceLabel) {
  return (
    <ChoiceRow
      {...name}
      control={(labelProps, bare) => (
        <Base.Root
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next)}
          {...labelProps}
          disabled={disabled}
          className={cn(box({ tone }), bare && 'data-disabled:opacity-50', className)}
        >
          <Base.Indicator className="check-soft-mark">
            <CheckIcon size={13} />
          </Base.Indicator>
        </Base.Root>
      )}
    />
  );
}
