'use client';

import { Switch as Base } from '@base-ui/react/switch';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { Tone } from './tones';

export type SwitchTone = Extract<Tone, 'green' | 'neutral'>;

const track = cva(
  'relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-ctl ' +
    'border px-[2px] outline-none transition-colors duration-fast ' +
    'focus-visible:border-border-active disabled:cursor-not-allowed disabled:opacity-50 ' +
    'motion-reduce:transition-none',
  {
    variants: {
      tone: {
        green:
          'bg-surface-sunk border-border-idle data-[checked]:bg-pill-green-bg data-[checked]:border-isk-dim',
        neutral:
          'bg-surface-sunk border-border-idle data-[checked]:bg-surface-raised data-[checked]:border-border-active',
      } satisfies Record<SwitchTone, string>,
    },
    defaultVariants: { tone: 'green' },
  },
);

const thumb = cva(

  'block h-[12px] w-[12px] rounded-[1px] translate-x-0 data-[checked]:translate-x-[14px] ' +
    'transition-[translate,background-color] duration-fast motion-reduce:transition-none',
  {
    variants: {
      tone: {
        green: 'bg-muted data-[checked]:bg-isk',
        neutral: 'bg-muted data-[checked]:bg-text',
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
      <Base.Thumb className={thumb({ tone })} />
    </Base.Root>

  );
}
