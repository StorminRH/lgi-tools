/**
 * Opening a pilot: its rail portrait morphs into the sheet while the rail and
 * the overview fade, then the sheet rises in (identity, then panels).
 * Closing runs the mirror. Timings live in HomeBoardView.css; any other
 * transition leaves the board alone.
 */
export const OVERVIEW_MOTION = {
  enter: { 'board-close': 'board-overview-in', default: 'none' },
  exit: { 'board-open': 'board-overview-out', default: 'none' },
};
export const SHEET_MOTION = {
  enter: { 'board-open': 'board-sheet-in', default: 'none' },
  exit: { 'board-close': 'board-sheet-out', default: 'none' },
};
export const PANELS_MOTION = {
  enter: { 'board-open': 'board-panels-in', default: 'none' },
  exit: { 'board-close': 'board-sheet-out', default: 'none' },
};

/** Shared by a pilot's rail portrait and its sheet portrait, so one morphs into the other. */
export function pilotTransitionName(characterId: number): string {
  return `pilot-${characterId}`;
}
