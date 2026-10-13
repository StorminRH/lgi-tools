import { useLayoutEffect, useRef } from 'react';
import { placeTooltip } from './tooltip-placement';

// Positions the tooltip layer from the hovered point, measured against the
// chart's own box so the tooltip never spills outside the chart.
export function useCssomTooltip(
  tooltipLeft: number | undefined,
  tooltipTop: number | undefined,
  tooltipOpen: boolean,
) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layer = tooltipRef.current;
    if (tooltipLeft == null || tooltipTop == null || layer === null) return;
    const chart = layer.parentElement?.getBoundingClientRect();
    const box = layer.firstElementChild?.getBoundingClientRect();
    const place =
      chart === undefined || box === undefined
        ? { x: tooltipLeft, y: tooltipTop }
        : placeTooltip({ x: tooltipLeft, y: tooltipTop }, box, chart);
    layer.style.setProperty('--tt-x', `${place.x}px`);
    layer.style.setProperty('--tt-y', `${place.y}px`);
  }, [tooltipLeft, tooltipTop, tooltipOpen]);
  return tooltipRef;
}
