import { createElement, type ComponentProps } from 'react';
import { cn } from './cn';

export const cardSurface =
  'border border-border bg-section text-text rounded-card shadow-card-edge';

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
        hover &&
          'transition-[border-color,box-shadow] hover:border-card-glow-border hover:shadow-card-hover',
        className,
      ),
      ...rest,
    },
    children,
  );
}
