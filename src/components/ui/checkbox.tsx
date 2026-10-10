'use client';

import { Checkbox as Base } from '@base-ui/react/checkbox';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import { CheckIcon } from './icons';
import type { Tone } from './tones';

export type CheckboxTone = Extract<Tone, 'green' | 'neutral' | 'red'>;

const box = cva(
  'check-soft inline-flex size-5 shrink-0 cursor-pointer items-center justify-center outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-isk-sub disabled:cursor-not-allowed disabled:opacity-50',
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

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  tone = 'green',
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  tone?: CheckboxTone;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Base.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      aria-label={label}
      disabled={disabled}
      className={cn(box({ tone }), className)}
    >
      <Base.Indicator className="check-soft-mark">
        <CheckIcon size={13} />
      </Base.Indicator>
    </Base.Root>
  );
}
