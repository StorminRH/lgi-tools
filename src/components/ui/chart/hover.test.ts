import { describe, it, expect, vi } from 'vitest';
import type { MouseEvent } from 'react';
import { continuousHoverHandler } from './hover';

vi.mock('@visx/event', () => ({
  // Return the pointer straight through; the handler only uses point.x, which
  // our fake identity scale then maps to data space unchanged.
  localPoint: (_el: unknown, _ev: unknown) => ({ x: 10, y: 0 }),
}));

// Identity scale that is also invertible — data space === pixel space here.
const identityScale = Object.assign((v: number) => v, { invert: (x: number) => x });

const evt = { nativeEvent: {} } as unknown as MouseEvent<SVGRectElement>;

describe('continuousHoverHandler', () => {
  const data = [
    { x: 0, y: 5 },
    { x: 10, y: 7 },
    { x: 20, y: 3 },
  ];

  it('opens the tooltip at the datum nearest the inverted pointer', () => {
    const showTooltip = vi.fn();
    const handler = continuousHoverHandler({
      svgRef: { current: null },
      xScale: identityScale,
      yScale: (v) => v,
      xs: data.map((d) => d.x),
      data,
      showTooltip,
    });

    handler(evt);

    expect(showTooltip).toHaveBeenCalledWith({
      tooltipData: data[1],
      tooltipLeft: 10,
      tooltipTop: 7,
    });
  });

  it('does nothing on an empty series (no nearest datum)', () => {
    const showTooltip = vi.fn();
    const handler = continuousHoverHandler({
      svgRef: { current: null },
      xScale: identityScale,
      yScale: (v) => v,
      xs: [],
      data: [] as { x: number; y: number }[],
      showTooltip,
    });

    handler(evt);
    expect(showTooltip).not.toHaveBeenCalled();
  });
});
