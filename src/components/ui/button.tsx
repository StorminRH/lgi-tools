import type { ComponentPropsWithRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonStateClasses =
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-isk-sub';

export const buttonVariants = cva(
  'inline-flex items-center justify-center font-ui text-nav ' +
    `rounded-ctl ${buttonStateClasses}`,
  {
    variants: {
      variant: {
        primary:
          'bg-feedback-bg text-isk border border-isk-dim shadow-btn-bezel ' +
          'hover:bg-isk hover:text-isk-ink hover:border-isk',
        secondary:
          'border border-border-idle text-name shadow-btn-bezel hover:border-border-active',
        ghost: 'text-muted hover:text-isk',
        danger:
          'bg-pill-red-bg text-pill-red-text border border-pill-red-border shadow-btn-bezel ' +
          'hover:border-hostile',
      },
      size: {
        md: 'px-4 py-2',
        sm: 'px-2.5 py-[5px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type StyledButtonProps = Omit<VariantProps<typeof buttonVariants>, 'variant'> & {
  variant?: NonNullable<VariantProps<typeof buttonVariants>['variant']>;
};

export type BareButtonProps = Omit<VariantProps<typeof buttonVariants>, 'variant' | 'size'> & {
  variant: 'bare';
  size?: never;
};

export function Button({
  variant,
  size,
  type = 'button',
  className,
  ...props
}: ComponentPropsWithRef<'button'> & (StyledButtonProps | BareButtonProps)) {
  if (variant === 'bare') {
    return (
      <button
        type={type}
        className={cn('inline-flex items-center', buttonStateClasses, className)}
        {...props}
      />
    );
  }
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
