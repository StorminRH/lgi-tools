import type { ReactNode, RefObject } from 'react';
import { cn } from '../cn';

type ChartCanvasProps = {
  svgRef: RefObject<SVGSVGElement | null>;
  width: number;
  height: number;
  ariaLabel: string;
  className?: string;
  /** SVG content — axes, series, hover layer. */
  children: ReactNode;
  tooltipRef: RefObject<HTMLDivElement | null>;
  tooltipOpen: boolean;
  /**
   * Tooltip body (the inner spans). Pass `null` when there's no hovered datum;
   * the tooltip only renders when open AND non-null, matching the original
   * `tooltipOpen && tooltipData` guard.
   */
  tooltip: ReactNode;
};

/**
 * The shared chart frame: a `relative` wrapper (visx tooltips need it), the
 * `<svg>` host, and the self-rendered `.sparkline-tooltip` div positioned via
 * the CSSOM ref. Geometry stays off inline `style` (house style). Each chart
 * supplies its own SVG content and tooltip body.
 */
export function ChartCanvas({
  svgRef,
  width,
  height,
  ariaLabel,
  className,
  children,
  tooltipRef,
  tooltipOpen,
  tooltip,
}: ChartCanvasProps) {
  return (
    <div className={cn('relative inline-block', className)}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className="block overflow-visible"
      >
        {children}
      </svg>

      {tooltipOpen && tooltip && (
        <div ref={tooltipRef} className="sparkline-tooltip" aria-hidden>
          <div className="sparkline-tooltip-box font-mono">{tooltip}</div>
        </div>
      )}
    </div>
  );
}
