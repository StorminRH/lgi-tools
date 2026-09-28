export interface Size {
  width: number;
  height: number;
}

const GAP = 10;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Where a chart tooltip's top-left corner goes: centred above the hovered
 * point when it fits; beside it (left near the right edge, right near the
 * left edge) when it would spill sideways; always clamped inside the chart.
 */
export function placeTooltip(anchor: { x: number; y: number }, box: Size, bounds: Size): { x: number; y: number } {
  let x = anchor.x - box.width / 2;
  let y = anchor.y - GAP - box.height;
  if (x + box.width > bounds.width) {
    x = anchor.x - GAP - box.width;
    y = anchor.y - box.height / 2;
  } else if (x < 0) {
    x = anchor.x + GAP;
    y = anchor.y - box.height / 2;
  }
  return {
    x: clamp(x, 0, bounds.width - box.width),
    y: clamp(y, 0, bounds.height - box.height),
  };
}
