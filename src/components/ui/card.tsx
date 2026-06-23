import type { ReactNode } from 'react';
import { cn } from './cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border border-border bg-section text-text font-mono rounded-[6px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
