export interface LeaderRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface EditorLeader {

  readonly bracket: { readonly x: number; readonly top: number; readonly bottom: number };
  readonly line: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
}

const BRACKET_GAP_PX = 3;

const MIN_BRACKET_PX = 10;

const PANEL_INSET_PX = 8;

function clamp(value: number, low: number, high: number): number {
  if (high < low) return low;
  return Math.min(Math.max(value, low), high);
}

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
  const panelTop = panel.top - origin.top;
  const panelBottom = panel.bottom - origin.top;

  return {
    bracket: { x, top, bottom },
    line: {
      x1: x,
      y1: middle,
      x2: panelLeft,
      y2: clamp(
        middle,
        panelTop + PANEL_INSET_PX,
        panelBottom - PANEL_INSET_PX,
      ),
    },
  };
}
