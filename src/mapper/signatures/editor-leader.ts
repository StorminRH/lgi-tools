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

/**
 * How far above the row the card's attach point sits, so the card floats up
 * and away from the scanner the way system cards rise off their disc.
 */
export const SCANNER_CARD_RISE_PX = 40;

/** Level run off the bracket before the leader turns toward the card. */
const STUB_PX = 12;

/** Level run into the card edge after the turn. */
const MIN_RUN_PX = 14;

const CORNER_RADIUS_PX = 8;

function clamp(value: number, low: number, high: number): number {
  if (high < low) return low;
  return Math.min(Math.max(value, low), high);
}

/**
 * A bracket on the selected row's right edge and a callout to the card: a
 * short level stub, a 45° turn toward the card's attach point, and a level
 * run into its edge. The attach point sits SCANNER_CARD_RISE_PX above the
 * row, clamped to the card's side when the card cannot reach that height.
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
    middle - SCANNER_CARD_RISE_PX,
    panel.top - origin.top + PANEL_INSET_PX,
    panel.bottom - origin.top - PANEL_INSET_PX,
  );
  const start = { x, y: middle };
  const end = { x: panelLeft, y: attachY };
  const rise = attachY - middle;
  const stubX = Math.min(x + STUB_PX, panelLeft);
  const room = panelLeft - MIN_RUN_PX - stubX;
  const points = Math.abs(rise) < 1 || room <= 0
    ? [start, { x: panelLeft, y: middle }]
    : [
        start,
        { x: stubX, y: middle },
        { x: stubX + Math.min(Math.abs(rise), room), y: attachY },
        end,
      ];

  return {
    bracket: { x, top, bottom },
    path: roundedLeaderPath(points, CORNER_RADIUS_PX),
    end: points[points.length - 1] ?? end,
  };
}
