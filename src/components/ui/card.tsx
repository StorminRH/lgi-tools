import type { ReactNode } from 'react';
import { cn } from './cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'border border-border bg-bg text-text font-mono',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  meta,
  trailing,
}: {
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex justify-between items-start gap-2 px-3.5 pt-[11px] pb-[9px] border-b border-border">
      <div className="min-w-0">
        <div className="font-display font-bold text-[18px] leading-none tracking-[0.02em] text-name mb-1.5">
          {title}
        </div>
        {meta && <div className="flex gap-[5px] flex-wrap items-center">{meta}</div>}
      </div>
      {trailing && <div className="text-right shrink-0">{trailing}</div>}
    </div>
  );
}
