import type { ReactNode } from 'react';
import { cn } from './cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border-[1.5px] border-border bg-bg text-text font-mono',
        className,
      )}
    >
      {children}
    </div>
  );
}
