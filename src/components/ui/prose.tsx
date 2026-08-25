import type { ComponentProps } from 'react';
import { cn } from './cn';

/** Renders a shared long-form reading surface with legal descendant styling. */
export function Prose({
  variant = 'legal',
  className,
  ...props
}: {
  variant?: 'legal';
} & ComponentProps<'div'>) {
  return <div className={cn('prose-copy', `prose-copy-${variant}`, className)} {...props} />;
}
