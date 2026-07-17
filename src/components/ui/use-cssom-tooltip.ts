import { useLayoutEffect, useRef } from 'react';

/**
 * Positions a self-rendered chart tooltip via CSS custom properties set through
 * the CSSOM — never an inline `style` attribute (house style). Mirrors
 * ProgressBar, but runs in a layout effect: the tooltip mounts conditionally on
 * hover, so the position must land before paint or the first frame flashes at
 * the `translate(0,0)` fallback. Returns the ref to attach to the tooltip div.
 */
export function useCssomTooltip(
  tooltipLeft: number | undefined,
  tooltipTop: number | undefined,
  tooltipOpen: boolean,
) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (tooltipLeft == null || tooltipTop == null) return;
    tooltipRef.current?.style.setProperty('--tt-x', `${tooltipLeft}px`);
    tooltipRef.current?.style.setProperty('--tt-y', `${tooltipTop}px`);
  }, [tooltipLeft, tooltipTop, tooltipOpen]);
  return tooltipRef;
}
