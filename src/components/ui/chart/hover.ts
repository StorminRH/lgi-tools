import type { MouseEvent, RefObject } from 'react';
import { localPoint } from '@visx/event';
import { continuousHoverTarget } from './chart-geometry';

export type InvertibleScale = ((value: number) => number) & { invert: (x: number) => number };

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
