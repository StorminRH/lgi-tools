import { createElement, type ComponentProps } from 'react';
import { cn } from './cn';

export const cardSurface =
  'border border-border glass-surface glass-lit text-text rounded-card shadow-card-edge';

// Glass that floats above the page: the header bar, the hero search and
// pinned controls. Callers choose the shape (rounded-full, rounded-sheet).
export const floatSurface = 'border border-border glass-surface glass-lit shadow-float';

// The round 40px floating glass button that opens an icon menu (⋯, ☰).
export const floatIconTrigger = `${floatSurface} flex size-10 cursor-pointer items-center justify-center rounded-full text-muted outline-none transition-colors hover:border-border-active hover:text-name focus-visible:border-border-active`;

// A row or tile set into a surface: list items inside cards and dialogs.
export const insetSurface = 'rounded-ctl border border-border-soft bg-bg-deep/60';

export function Card({
  hover,
  font = 'ui',
  as = 'div',
  className,
  children,
  ...rest
}: {
  hover?: boolean;
  font?: 'ui' | 'data';
  as?: 'div' | 'li' | 'section';
} & ComponentProps<'div'>) {
  return createElement(
    as,
    {
      className: cn(
        cardSurface,
        font === 'data' ? 'font-data' : 'font-ui',
        hover && 'lift',
        className,
      ),
      ...rest,
    },
    children,
  );
}
