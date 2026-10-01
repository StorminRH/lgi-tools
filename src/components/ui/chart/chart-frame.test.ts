import type { ReactElement } from 'react';
import type { scaleLinear } from '@visx/scale';
import { expect, test, vi } from 'vitest';

type Point = { x: number; y: number; label: string };

const h = vi.hoisted(() => ({
  tooltipData: undefined as unknown,
  showTooltip: vi.fn(),
  hideTooltip: vi.fn(),
}));

vi.mock('./use-chart-hover', () => ({
  useChartHover: () => ({
    svgRef: { current: null },
    tooltipRef: { current: null },
    tooltipOpen: h.tooltipData !== undefined,
    tooltipLeft: undefined,
    tooltipTop: undefined,
    tooltipData: h.tooltipData,
    showTooltip: h.showTooltip,
    hideTooltip: h.hideTooltip,
  }),
}));

import { TimeSeriesFrame } from './chart-frame';

interface FocusProps {
  readonly tabIndex: number;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onKeyDown: (event: { key: string }) => void;
}

const points: Point[] = [
  { x: 1, y: 10, label: 'Mon' },
  { x: 2, y: 20, label: 'Tue' },
  { x: 3, y: 30, label: 'Wed' },
];

function focusFrame(): FocusProps {
  const frame = TimeSeriesFrame<Point>({
    points,
    xScale: ((value: number) => value * 100) as unknown as ReturnType<typeof scaleLinear<number>>,
    yScale: (value) => 200 - value,
    width: 400,
    height: 200,
    margin: { top: 4, right: 4, bottom: 20, left: 30 },
    ariaLabel: 'Kills',
    crosshairColor: 'red',
    formatTick: (label) => label,
    renderTooltip: (point) => point.label,
    children: null,
  }) as ReactElement<object, (props: object) => ReactElement<FocusProps>>;
  return frame.type(frame.props).props;
}

test('keyboard focus shows the last point, arrows step within the series, and blur hides', () => {
  h.showTooltip.mockClear();
  h.tooltipData = undefined;
  const idle = focusFrame();
  expect(idle.tabIndex).toBe(0);

  idle.onFocus();
  expect(h.showTooltip).toHaveBeenLastCalledWith({ tooltipData: points[2], tooltipLeft: 300, tooltipTop: 170 });

  // With nothing shown yet, arrows start from the last point.
  idle.onKeyDown({ key: 'ArrowLeft' });
  expect(h.showTooltip).toHaveBeenLastCalledWith({ tooltipData: points[1], tooltipLeft: 200, tooltipTop: 180 });
  idle.onKeyDown({ key: 'ArrowRight' });
  expect(h.showTooltip).toHaveBeenLastCalledWith({ tooltipData: points[2], tooltipLeft: 300, tooltipTop: 170 });

  h.tooltipData = points[0];
  const atFirst = focusFrame();
  atFirst.onKeyDown({ key: 'ArrowLeft' });
  expect(h.showTooltip).toHaveBeenLastCalledWith({ tooltipData: points[0], tooltipLeft: 100, tooltipTop: 190 });
  atFirst.onKeyDown({ key: 'ArrowRight' });
  expect(h.showTooltip).toHaveBeenLastCalledWith({ tooltipData: points[1], tooltipLeft: 200, tooltipTop: 180 });

  const calls = h.showTooltip.mock.calls.length;
  atFirst.onKeyDown({ key: 'Enter' });
  atFirst.onKeyDown({ key: 'ArrowUp' });
  expect(h.showTooltip).toHaveBeenCalledTimes(calls);

  atFirst.onBlur();
  expect(h.hideTooltip).toHaveBeenCalledTimes(1);
});
