import { roundedLeaderPath } from '../windows/leader-path';

export interface LeaderRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface EditorLeader {
  readonly bracket: { readonly x: number; readonly top: number; readonly bottom: number };
  /** Rounded connector from the bracket to the panel edge, drawn in that order. */
  readonly path: string;
  readonly end: { readonly x: number; readonly y: number };
}

const BRACKET_GAP_PX = 3;

const MIN_BRACKET_PX = 10;

/** Keeps the attach point clear of the panel's rounded corners. */
const PANEL_INSET_PX = 18;

const CORNER_RADIUS_PX = 6;

function clamp(value: number, low: number, high: number): number {
  if (high < low) return low;
  return Math.min(Math.max(value, low), high);
}

/**
 * A bracket on the selected row's right edge and a connector to the panel.
 * When the row faces the panel the connector is one horizontal run; when it
 * does not, it steps across at the midpoint of the gap with rounded corners
 * instead of slanting.
 */
export function editorLeader(input: {
  readonly row: LeaderRect;
  readonly panel: LeaderRect;
  readonly origin: { readonly left: number; readonly top: number };
  readonly clip?: LeaderRect;
}): EditorLeader | null {
  const { row, panel, origin, clip } = input;
  const rowTop = clip === undefined ? row.top : Math.max(row.top, clip.top);
  const rowBottom =
    clip === undefined ? row.bottom : Math.min(row.bottom, clip.bottom);
  const rowHeight = rowBottom - rowTop;
  const panelHeight = panel.bottom - panel.top;
  if (rowHeight <= 0 || panelHeight <= 0) return null;

  const x = row.right - origin.left + BRACKET_GAP_PX;
  const panelLeft = panel.left - origin.left;
  if (panelLeft <= x) return null;

  const top = rowTop - origin.top;
  const rawBottom = rowBottom - origin.top;
  const floor = Math.max(rawBottom, top + MIN_BRACKET_PX);
  const bottom =
    clip === undefined ? floor : Math.min(floor, clip.bottom - origin.top);
  const middle = (top + bottom) / 2;
  const attachY = clamp(
    middle,
    panel.top - origin.top + PANEL_INSET_PX,
    panel.bottom - origin.top - PANEL_INSET_PX,
  );
  const end = { x: panelLeft, y: attachY };
  const start = { x, y: middle };
  const stepX = x + (panelLeft - x) / 2;
  const points = Math.abs(attachY - middle) < 1
    ? [start, { x: panelLeft, y: middle }]
    : [start, { x: stepX, y: middle }, { x: stepX, y: attachY }, end];

  return {
    bracket: { x, top, bottom },
    path: roundedLeaderPath(points, CORNER_RADIUS_PX),
    end,
  };
}
