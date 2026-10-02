import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';
import { SearchIcon } from './icons';

export const fieldVariants = cva('field-glass field-own-focus', {
  variants: {
    size: { md: 'px-3.5 py-2', sm: 'px-3 py-1' },
  },
  defaultVariants: { size: 'md' },
});

export const fieldText = 'font-ui text-nav text-name placeholder:text-faint';
export const triggerShape = 'field-trigger';
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
    <div className={cn(fieldVariants({ size }), 'field-pill flex items-center gap-2.5 pl-4 pr-2.5', className)}>
      {prompt ? <SearchIcon size={15} /> : null}
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
        'field-pill',
        fieldText,
        'block w-full resize-y px-4 py-3 leading-relaxed',
        className,
      )}
      {...props}
    />
  );
}
