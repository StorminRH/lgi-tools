import { useLayoutEffect, useRef } from 'react';

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
