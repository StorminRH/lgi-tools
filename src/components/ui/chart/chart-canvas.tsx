import type { ReactNode, RefObject } from 'react';
import { cn } from '../cn';

export type ChartCanvasProps = {
  svgRef: RefObject<SVGSVGElement | null>;
  width: number;
  height: number;
  ariaLabel: string;
  className?: string;

  children: ReactNode;
  tooltipRef: RefObject<HTMLDivElement | null>;
  tooltipOpen: boolean;

  tooltip: ReactNode;
};

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
          <div className="sparkline-tooltip-box glass-panel font-data">{tooltip}</div>

        </div>

      )}
    </div>

  );
}
