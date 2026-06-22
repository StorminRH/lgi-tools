import type { ReactNode } from 'react';
import { cn } from './cn';

// The house style for any "?" hover panel's content: a green terminal-style
// header over a stack of rows. Pairs with <HoverPopover> (which supplies the
// panel chrome — bg, border, padding); this lays out the content inside it.
export function TooltipPanel({
  header,
  children,
  className,
}: {
  header: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-isk">
        {header}
      </div>
      {children}
    </div>
  );
}

// A "Label — description" row: a bright bold label, an em dash, then muted body
// text (the score-tooltip idiom). Put the concrete value in parentheses, e.g.
// <TooltipRow label="Liquidity">how fast a batch sells (≈ 3 days to clear)</TooltipRow>.
export function TooltipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="font-body text-[12.5px] leading-snug text-muted">
      <span className="font-semibold text-text">{label}</span> — {children}
    </p>
  );
}
