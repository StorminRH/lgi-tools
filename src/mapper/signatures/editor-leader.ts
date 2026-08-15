// Geometry for the Signature Editor's leader line and scanner-row bracket.
//
// Pure on purpose: the editor pop-out sits in screen space beside the scanner
// dock (4.0.4.3.2 ruling D-G), so the only thing tying it to the row it was
// opened from is this drawn cue. Everything that decides where the bracket and
// line land lives here and is unit-tested; the component only measures rects
// and paints what it is told.

/** The measured client rectangle inputs this module needs. */
export interface LeaderRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** One drawn leader: a bracket beside the row and a line into the panel. */
export interface EditorLeader {
  /** Bracket spine x, and the row span it embraces (layer-local). */
  readonly bracket: { readonly x: number; readonly top: number; readonly bottom: number };
  readonly line: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
}

/** Gap between the row's right edge and the bracket spine. */
const BRACKET_GAP_PX = 3;

/** Shortest bracket drawn, so a squeezed row still reads as a bracket. */
const MIN_BRACKET_PX = 10;

/** How far inside the panel's own edges the leader may terminate. */
const PANEL_INSET_PX = 8;

function clamp(value: number, low: number, high: number): number {
  if (high < low) return low;
  return Math.min(Math.max(value, low), high);
}

/**
 * Derives the bracket and leader line joining one scanner row to the editor
 * panel, or `null` when the cue would be a lie.
 *
 * It is a lie in exactly four cases: a collapsed row (an unmounted or
 * scrolled-away row measures zero height), a row that no longer intersects
 * the scanner clip, a panel that has not been laid out yet, and a panel
 * drawn left of its row — the editor is anchored to the right of the
 * scanner dock by construction, so a leftward line would point at nothing
 * the user can follow.
 */
export function editorLeader(input: {
  readonly row: LeaderRect;
  readonly panel: LeaderRect;
  /** The drawing layer's own client origin; output is layer-local. */
  readonly origin: { readonly left: number; readonly top: number };
  /** Visible scanner list; the cue hides when the row leaves this rect. */
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
  const bottom =
    clip === undefined ? Math.max(rawBottom, top + MIN_BRACKET_PX) : rawBottom;
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
