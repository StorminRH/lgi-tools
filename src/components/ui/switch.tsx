'use client';

import { Switch as Base } from '@base-ui/react/switch';
import { cva } from 'class-variance-authority';
import { ChoiceRow, type ChoiceLabel } from './choice-row';
import { cn } from './cn';
import type { Tone } from './tones';

export type SwitchTone = Extract<Tone, 'green' | 'neutral'>;

const track = cva(
  'switch-soft relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full px-[3px] ' +
    'outline-none focus-visible:ring-2 focus-visible:ring-isk-sub data-disabled:cursor-not-allowed',
  {
    variants: {
      tone: {
        green: '[--switch-tone:var(--color-isk)] [--switch-ink:var(--color-isk-bright)]',
        neutral: '[--switch-tone:var(--color-text)] [--switch-ink:var(--color-name)]',
      } satisfies Record<SwitchTone, string>,
    },
    defaultVariants: { tone: 'green' },
  },
);

/** A switch, bare under an aria-label or inside a visible label row (see ChoiceLabel). */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  tone = 'green',
  className,
  ...name
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  tone?: SwitchTone;
  className?: string;
} & ChoiceLabel) {
  return (
    <ChoiceRow
      {...name}
      control={(labelProps, bare) => (
        <Base.Root
          id={id}
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next)}
          disabled={disabled}
          {...labelProps}
          className={cn(track({ tone }), bare && 'data-disabled:opacity-50', className)}
        >
          <Base.Thumb className="switch-soft-thumb block size-4 rounded-full" />
        </Base.Root>
      )}
    />
  );
}
