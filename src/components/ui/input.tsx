import type { ComponentProps, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

// The form-field primitives ("Inset Instrument", 3.8.2.2): a text Input, a native
// Select, and a Textarea, all engraved into the same dark inset well. One
// `fieldVariants` owns the well surface (bg-bg-deep + inset shadow + control
// radius) so the three never drift; the well shows focus via the ISK-sub border +
// focus ring. `fieldText` is the shared value-text treatment applied to the actual
// <input>/<select>/<textarea> control. Select is the ONLY sanctioned raw <select>
// (the lint guard exempts this slice).
const fieldVariants = cva(
  'bg-bg-deep border border-border-soft shadow-field-inset rounded-ctl',
  {
    variants: {
      size: { md: 'px-2 py-1', sm: 'px-2 py-0.5' },
    },
    defaultVariants: { size: 'md' },
  },
);

const fieldText = 'text-ui font-mono text-text placeholder:text-muted';
const focusWell = 'focus-within:border-isk-sub focus-within:shadow-field-focus';
const innerControl = 'w-full bg-transparent outline-none border-0';

type FieldSize = VariantProps<typeof fieldVariants>;

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
}: FieldSize & { prompt?: boolean; trailing?: ReactNode } & ComponentProps<'input'>) {
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

// A native select in the same well, with a custom caret. Forwards children (the
// <option>/<optgroup>), value/onChange/disabled/aria-label.
export function Select({
  size,
  className,
  children,
  ...props
}: FieldSize & ComponentProps<'select'>) {
  return (
    <div className={cn(fieldVariants({ size }), focusWell, 'relative flex items-center', className)}>
      <select className={cn(fieldText, innerControl, 'cursor-pointer appearance-none pr-5')} {...props}>
        {children}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-2 text-muted">
        ▾
      </span>
    </div>
  );
}

// A multi-line field — the surface IS the control, so the well tokens sit directly
// on the <textarea>.
export function Textarea({
  size,
  className,
  ...props
}: FieldSize & ComponentProps<'textarea'>) {
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
