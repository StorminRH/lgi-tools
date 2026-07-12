import type { ComponentProps } from 'react';
import { cn } from './cn';

// The card/panel surface ("Inset Instrument", 3.8.2.2): section fill, border, the
// card radius, and a faint top-edge light (--shadow-card-edge). Absorbs the old
// industry PANEL and the wormhole-sites `.sites-card`.
//   - `hover` (opt-in) reproduces the `.sites-card:hover` glow ring + lift exactly.
//   - `font` defaults to 'mono' (the terminal chrome); sites cards pass 'body'
//     (Geist) so their prose doesn't regress to monospace.
// Extra div props (data-*, onClick, id, …) forward through — the sites lightbox
// keys off a `data-*` hook on this element.
export function Card({
  hover,
  font = 'mono',
  className,
  children,
  ...rest
}: { hover?: boolean; font?: 'mono' | 'body' } & ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border border-border bg-section text-text rounded-card shadow-card-edge',
        font === 'body' ? 'font-body' : 'font-mono',
        hover &&
          'transition-[border-color,box-shadow] hover:border-card-glow-border hover:shadow-card-hover',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
