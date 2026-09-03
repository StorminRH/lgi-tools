import type { ReactNode } from 'react';
import { cn } from './cn';

export function PageShell({
  mode,
  className,
  children,
}: {
  mode: 'workspace' | 'reading' | 'detail';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-page-shell
      data-page-shell-mode={mode}
      className="mx-auto w-full max-w-frame px-7 pb-region"
    >
      <div
        data-page-shell-content
        className={cn(
          mode === 'reading' && 'mx-auto max-w-reading',
          mode === 'detail' && 'pt-region',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
