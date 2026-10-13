import type { ReactNode } from 'react';
import { cn } from './cn';
import { eyebrow } from './type-roles';

/**
 * `bar` is a card's header strip: a semibold label on the row tint, a step
 * larger than an eyebrow. `sub` titles a block inside a card body in plain
 * text, so it reads as subordinate to the card's own header rather than as a
 * second one.
 *
 * `as` renders the label as a real heading for the document outline; the
 * default is a plain span.
 */
export function SectionHeader({
  label,
  hint,
  size = 'sm',
  variant = 'bar',
  as: Label = 'span',
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  size?: 'sm' | 'md';
  variant?: 'bar' | 'sub';
  as?: 'span' | 'h2' | 'h3';
  className?: string;
}) {
  const bar = cn(
    eyebrow({ weight: 'semibold' }),
    'bg-row-hover border-b border-border-soft px-3.5',
    size === 'md' ? 'text-bar py-2' : 'text-small py-[5px]',
  );
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        variant === 'bar' ? bar : 'font-ui text-ui font-medium text-text',
        className,
      )}
    >
      <Label>{label}</Label>
      {hint && <span className="text-micro font-normal text-muted">{hint}</span>}
    </div>
  );
}
