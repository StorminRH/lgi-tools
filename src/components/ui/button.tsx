import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

// The action-button primitive ("Inset Instrument", 3.8.2.2). Four intents mapped
// to tokens via cva; two sizes. `buttonVariants` is exported so a navigational
// `<a>`/`<Link>` that must look like a button can wear the same look without a
// second source of truth (it can't be a <button>). The bezel (--shadow-btn-bezel)
// gives every intent except `ghost` a subtle physical raise.
export const buttonVariants = cva(
  'inline-flex items-center justify-center font-mono uppercase tracking-[0.06em] text-ui ' +
    'rounded-ctl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-isk-sub',
  {
    variants: {
      variant: {
        // primary: the promoted green CTA — dim green surface, ISK text, fills
        // solid ISK on hover with dark-green ink.
        primary:
          'bg-feedback-bg text-isk border border-isk-dim shadow-btn-bezel ' +
          'hover:bg-isk hover:text-isk-ink hover:border-isk',
        // secondary: the default bordered action.
        secondary:
          'border border-border-idle text-name shadow-btn-bezel hover:border-border-active',
        // ghost: text-only inline action, no border, no bezel.
        ghost: 'text-muted hover:text-isk',
        // danger: destructive action.
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

export function Button({
  variant,
  size,
  // Default to 'button' so a Button inside a <form> doesn't submit by accident,
  // but keep it overridable — server-action forms pass type="submit" (and
  // name/value/formAction flow through ...props).
  type = 'button',
  className,
  ...props
}: VariantProps<typeof buttonVariants> & ComponentProps<'button'>) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
