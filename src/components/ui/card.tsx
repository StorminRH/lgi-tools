import { createElement, type ComponentProps } from 'react';
import { cn } from './cn';

/**
 * The card/panel surface ("Inset Instrument", 3.8.2.2): section fill, border, the
 * card radius, and a faint top-edge light (--shadow-card-edge). Absorbs the old
 * industry PANEL and the wormhole-sites `.sites-card`.
 *   - `hover` (opt-in) reproduces the `.sites-card:hover` glow ring + lift exactly.
 *   - `font` names the semantic role, not the face — a card whose body is prose
 *     stays on the interface face; a card that is a readout states the data face.
 * Extra div props (data-*, onClick, id, …) forward through — the sites lightbox
 * keys off a `data-*` hook on this element. `as` supports the default `div` and
 * semantic `li` rendering while preserving the same card surface and forwarded props.
 */
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
        'border border-border bg-section text-text rounded-card shadow-card-edge',
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
