'use client';

import { useRef } from 'react';
import { useTooltip } from '@visx/tooltip';
import { useCssomTooltip } from '../use-cssom-tooltip';

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
