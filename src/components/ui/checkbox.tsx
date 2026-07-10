'use client';

import { Checkbox as Base } from '@base-ui/react/checkbox';
import { cva } from 'class-variance-authority';
import { cn } from './cn';
import type { Tone } from './tones';

// The platform's one checkbox primitive — the idiomatic Base UI Checkbox styled
// to the existing tone tokens, the Switch's terminal look in multi-select form
// (a sunk square that fills with a solid inner block when ticked, not a rounded
// tick). Controlled (the caller owns `checked` + `onCheckedChange`);
// className-only state via Base UI's `data-checked`/`data-unchecked`
// attributes. An accessible `label` is required — Base UI renders a hidden
// `<input>`, so without a name the control is unlabelled. First consumer: the
// multibuy panel's tier scope list.

export type CheckboxTone = Extract<Tone, 'green' | 'neutral'>;

// The box. Unticked = a sunk square with an idle border; ticked = the ISK-green
// pill surface + dim-ISK border (the Switch track's affirmative tone).
const box = cva(
  'inline-flex h-[14px] w-[14px] shrink-0 cursor-pointer items-center justify-center ' +
    'rounded-[2px] border outline-none transition-colors duration-150 ' +
    'focus-visible:border-border-active motion-reduce:transition-none',
  {
    variants: {
      tone: {
        green:
          'bg-surface-sunk border-border-idle data-[checked]:bg-pill-green-bg data-[checked]:border-isk-dim',
        neutral:
          'bg-surface-sunk border-border-idle data-[checked]:bg-surface-raised data-[checked]:border-border-active',
      } satisfies Record<CheckboxTone, string>,
    },
    defaultVariants: { tone: 'green' },
  },
);

// The inner fill block — only mounted while ticked (Base unmounts the
// indicator when unchecked).
const fill = cva('block h-[8px] w-[8px] rounded-[1px]', {
  variants: {
    tone: {
      green: 'bg-isk',
      neutral: 'bg-text',
    } satisfies Record<CheckboxTone, string>,
  },
  defaultVariants: { tone: 'green' },
});

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  tone = 'green',
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  // Accessible name (the hidden input is otherwise unnamed).
  label: string;
  tone?: CheckboxTone;
  className?: string;
}) {
  return (
    <Base.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next)}
      aria-label={label}
      className={cn(box({ tone }), className)}
    >
      <Base.Indicator className={fill({ tone })} />
    </Base.Root>
  );
}
