import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Prose({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('prose-copy', className)} {...props} />;
}
