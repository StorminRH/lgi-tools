'use client';

import { Switch as Base } from '@base-ui/react/switch';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { Tone } from './tones';

// The platform's one toggle primitive — the idiomatic Base UI Switch styled to the
// existing tone tokens. Controlled (the caller owns `checked` + `onCheckedChange`).
// className-only state via Base UI's `data-checked`/`data-unchecked` attributes; the
// thumb is a small mono block that slides (a terminal toggle, not a rounded iOS pill).
// An accessible `label` is required — Base UI renders a hidden `<input>`, so without
// a name the control is unlabelled. Used by the corp structure-sharing toggle; reusable
// for any on/off setting.

export type SwitchTone = Extract<Tone, 'green' | 'neutral'>;

// The track. Off = a sunk rail with an idle border; on = the ISK-green pill surface +
// dim-ISK border (the affirmative tone).
const track = cva(
  'relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-[2px] ' +
    'border px-[2px] outline-none transition-colors duration-150 ' +
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

// The thumb — slides right when on (travel = inner track width − thumb width = 14px),
// tinted bright (ISK / text) when on, muted when off.
const thumb = cva(
  'block h-[12px] w-[12px] rounded-[1px] translate-x-0 data-[checked]:translate-x-[14px] ' +
    'transition-[translate,background-color] duration-150 motion-reduce:transition-none',
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
  // Accessible name (the hidden input is otherwise unnamed).
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
