import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

// The form-field primitives ("Inset Instrument", 3.8.2.2): a text Input and a
// Textarea, engraved into the same dark inset well. One `fieldVariants` owns the
// well surface (bg-bg-deep + inset shadow + control radius) so they never drift;
// the well shows focus via the ISK-sub border + focus ring. `fieldText` is the
// shared value-text treatment applied to the control. The dropdown Select (3.8.2.3)
// is a Base UI overlay and lives in its own file (select.tsx); it wears this same
// well as its closed trigger via the exported `fieldVariants`/`fieldText`/`focusWell`.
export const fieldVariants = cva(
  // `field-own-focus` opts the field out of the global keyboard focus ring — the
  // ISK-sub well border is its focus indicator, so the ring would just double it.
  'bg-bg-deep border border-border-soft shadow-field-inset rounded-ctl field-own-focus',
  {
    variants: {
      size: { md: 'px-2 py-1', sm: 'px-2 py-0.5' },
    },
    defaultVariants: { size: 'md' },
  },
);

export const fieldText = 'text-ui font-mono text-text placeholder:text-muted';
export const focusWell = 'focus-within:border-isk-sub focus-within:shadow-field-focus';
const innerControl = 'w-full bg-transparent outline-none border-0 field-own-focus';

export type FieldSize = VariantProps<typeof fieldVariants>;

// A text field. `className` styles the WELL (width/height overrides ride here, as
// today's inputClass consumers do); input props (value/onChange/placeholder/type)
// forward to the inner control. Optional leading `>` prompt glyph and a trailing
// slot (an inline unit, a clear button, …).
export function Input({
  size,
  prompt,
  trailing,
  className,
  ...props
}: FieldSize & { prompt?: boolean; trailing?: ReactNode } & Omit<ComponentProps<'input'>, 'size'>) {
  return (
    <div className={cn(fieldVariants({ size }), focusWell, 'flex items-center gap-1.5', className)}>
      {prompt ? (
        <span aria-hidden className="select-none font-mono text-ui text-isk">
          {'>'}
        </span>
      ) : null}
      <input className={cn(fieldText, innerControl)} {...props} />
      {trailing}
    </div>
  );
}

// A multi-line field — the surface IS the control, so the well tokens sit directly
// on the <textarea>.
export function Textarea({
  size,
  className,
  ...props
}: FieldSize & ComponentPropsWithRef<'textarea'>) {
  return (
    <textarea
      className={cn(
        fieldVariants({ size }),
        fieldText,
        'block w-full resize-y focus:border-isk-sub focus:shadow-field-focus',
        className,
      )}
      {...props}
    />
  );
}
