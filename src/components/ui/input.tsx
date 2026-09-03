import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

export const fieldVariants = cva(

  'bg-bg-deep border border-border-soft shadow-field-inset rounded-ctl field-own-focus',
  {
    variants: {
      size: { md: 'px-2 py-1', sm: 'px-2 py-0.5' },
    },
    defaultVariants: { size: 'md' },
  },
);

export const fieldText = 'text-ui font-data text-text placeholder:text-muted';

export const focusWell = 'focus-within:border-isk-sub focus-within:shadow-field-focus';
const innerControl = 'w-full bg-transparent outline-none border-0 field-own-focus';

export type FieldSize = VariantProps<typeof fieldVariants>;

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
        <span aria-hidden className="select-none font-data text-ui text-isk">
          {'>'}
        </span>

      ) : null}
      <input className={cn(fieldText, innerControl)} {...props} />
      {trailing}
    </div>

  );
}

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
