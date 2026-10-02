import type { ComponentProps } from 'react';
import { cn } from './cn';

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'kbd-flat inline-flex h-6 min-w-6 items-center justify-center px-[7px] font-ui text-label font-medium text-text',
        className,
      )}
      {...props}
    />
  );
}
