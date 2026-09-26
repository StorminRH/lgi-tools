import { createElement, type ComponentProps } from 'react';
import { cn } from './cn';

export const cardSurface =
  'border border-border glass-surface glass-lit text-text rounded-card shadow-card-edge';

// Glass that floats above the page: the header bar, the hero search and
// pinned controls. Callers choose the shape (rounded-full, rounded-sheet).
export const floatSurface = 'border border-border glass-surface glass-lit shadow-float';

// Hover for clickable glass that should not move, where Card's `lift` would.
export const surfaceGlowHover =
  'transition-[border-color,box-shadow] hover:border-border-active hover:shadow-card-hover';

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
  as?: 'div' | 'li';
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
