import type { ComponentProps } from 'react';
import { cn } from './cn';

/** Renders a shared long-form reading surface with legal descendant styling. */
export function Prose({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('prose-copy', className)} {...props} />;
}
