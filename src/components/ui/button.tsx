import type { ComponentPropsWithRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonStateClasses =
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-isk-sub';

// Buttons are pills of lit glass, like the floating header and the Feedback
// button: a top sheen, a soft float shadow, and a tint by role.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-ui text-nav font-medium ' +
    'active:scale-[0.97] transition-[color,background-color,border-color,box-shadow,filter,scale] ' +
    `ease-spring rounded-full ${buttonStateClasses}`,
  {
    variants: {
      variant: {
        primary:
          'glass-lit bg-isk/10 text-isk border border-isk/35 shadow-float ' +
          'hover:bg-isk hover:border-isk hover:text-isk-ink',
        secondary:
          'border border-border glass-surface glass-lit text-name shadow-float ' +
          'hover:border-border-active hover:bg-row-related',
        ghost: 'text-muted hover:text-isk',
        danger:
          'glass-lit bg-pill-red-bg text-pill-red-text border border-pill-red-border shadow-float ' +
          'hover:border-hostile',
      },
      size: {
        md: 'px-5 py-2',
        sm: 'px-3 py-[5px]',
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
