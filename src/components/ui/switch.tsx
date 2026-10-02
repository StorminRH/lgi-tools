'use client';

import { Switch as Base } from '@base-ui/react/switch';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { Tone } from './tones';

export type SwitchTone = Extract<Tone, 'green' | 'neutral'>;

const track = cva(
  'switch-soft relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full px-[3px] ' +
    'outline-none focus-visible:ring-2 focus-visible:ring-isk-sub disabled:cursor-not-allowed disabled:opacity-50',
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

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  label,
  tone = 'green',
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label: string;
  tone?: SwitchTone;
  className?: string;
}) {
  return (
    <Base.Root
      id={id}
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      disabled={disabled}
      aria-label={label}
      className={cn(track({ tone }), className)}
    >
      <Base.Thumb className="switch-soft-thumb block size-4 rounded-full" />
    </Base.Root>
  );
}
