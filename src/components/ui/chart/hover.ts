import type { MouseEvent, RefObject } from 'react';
import { localPoint } from '@visx/event';
import { continuousHoverTarget } from './chart-geometry';

/** A d3/visx numeric scale used for a continuous axis: callable + `.invert`. */
type InvertibleScale = ((value: number) => number) & { invert: (x: number) => number };

/**
 * Build the `onMouseMove` handler for a continuous-x line chart (Sparkline,
 * TrendChart): invert the pointer to data space, snap to the nearest datum, and
 * open the tooltip at that datum's position. The nearest-datum decision is the
 * pure {@link continuousHoverTarget}; this only wires it to the DOM event and
 * the visx tooltip state, so the two charts share one handler instead of copies.
 */
export function continuousHoverHandler<T extends { x: number; y: number }>(opts: {
  svgRef: RefObject<SVGSVGElement | null>;
  xScale: InvertibleScale;
  yScale: (value: number) => number;
  xs: number[];
  data: T[];
  showTooltip: (args: { tooltipData: T; tooltipLeft: number; tooltipTop: number }) => void;
}): (event: MouseEvent<SVGRectElement>) => void {
  const { svgRef, xScale, yScale, xs, data, showTooltip } = opts;
  return (event) => {
    const point = localPoint(svgRef.current as Element, event.nativeEvent);
    if (!point) return;
    const target = continuousHoverTarget(xs, xScale.invert(point.x), data);
    if (!target) return;
    showTooltip({
      tooltipData: target.datum,
      tooltipLeft: xScale(target.datum.x),
      tooltipTop: yScale(target.datum.y),
    });
  };
}
