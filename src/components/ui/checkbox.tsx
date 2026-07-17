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

/**
 * Closed presentation vocabulary for checkbox tone; feature callers map domain meaning to these
 * abstract values before rendering.
 */
export type CheckboxTone = Extract<Tone, 'green' | 'neutral' | 'red'>;

// The box. Unticked = a sunk square with an idle border; ticked = the ISK-green
// pill surface + dim-ISK border (the Switch track's affirmative tone).
const box = cva(
  'inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center ' +
    'rounded-ctl border outline-none transition-colors duration-fast ' +
    'focus-visible:border-border-active focus-visible:ring-1 focus-visible:ring-isk-sub ' +
    'disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
  {
    variants: {
      tone: {
        green:
          'bg-surface-sunk border-border-idle data-[checked]:bg-pill-green-bg data-[checked]:border-isk-dim',
        neutral:
          'bg-surface-sunk border-border-idle data-[checked]:bg-surface-raised data-[checked]:border-border-active',
        red:
          'bg-surface-sunk border-border-idle data-[checked]:bg-pill-red-bg data-[checked]:border-hostile',
      } satisfies Record<CheckboxTone, string>,
    },
    defaultVariants: { tone: 'green' },
  },
);

// The inner fill block — only mounted while ticked (Base unmounts the
// indicator when unchecked).
// eslint-disable-next-line no-restricted-syntax -- inner checkbox-fill indicator, sub-4px by design
const fill = cva('block h-[8px] w-[8px] rounded-[1px]', {
  variants: {
    tone: {
      green: 'bg-isk',
      neutral: 'bg-text',
      red: 'bg-hostile',
    } satisfies Record<CheckboxTone, string>,
  },
  defaultVariants: { tone: 'green' },
});

/**
 * Renders the domain-neutral checkbox with house behavior and tokens; callers own semantic meaning
 * and content while this primitive owns presentation.
 */
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
  // Accessible name (the hidden input is otherwise unnamed).
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
      <Base.Indicator className={fill({ tone })} />
    </Base.Root>
  );
}
