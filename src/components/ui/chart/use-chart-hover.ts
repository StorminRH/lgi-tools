'use client';

import { useRef } from 'react';
import { useTooltip } from '@visx/tooltip';
import { useCssomTooltip } from '../use-cssom-tooltip';

/**
 * Tooltip + svg-ref state shared by the chart primitives. Wraps visx's
 * state-only `useTooltip` (never its positioned `Tooltip` components, which use
 * inline `style`) and the CSSOM tooltip-positioning ref, so each chart shell
 * gets the hover plumbing in one call. `T` is the hovered datum type.
 */
export function useChartHover<T>() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { tooltipOpen, tooltipLeft, tooltipTop, tooltipData, showTooltip, hideTooltip } =
    useTooltip<T>();
  const tooltipRef = useCssomTooltip(tooltipLeft, tooltipTop, tooltipOpen);
  return {
    svgRef,
    tooltipRef,
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    showTooltip,
    hideTooltip,
  };
}
