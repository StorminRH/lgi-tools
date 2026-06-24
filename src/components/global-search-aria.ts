// Pure ARIA + keyboard helpers for the GlobalSearch combobox (AUDIT-009).
//
// Extracted so the keyboard-navigation model and the listbox/option id wiring
// can be unit-tested without a DOM — the repo tests logic, not rendered markup
// (the Humble Component pattern). The component owns only the JSX that wires
// these outputs onto the input/listbox/option elements.
//
// Together these implement the ARIA combobox pattern: the input is the
// combobox, the dropdown is its listbox, each row is an option, and the input's
// aria-activedescendant follows the visually-highlighted row so a screen reader
// announces it as the user arrows through results.

// Stable id for the dropdown listbox — referenced by the input's aria-controls.
export const SEARCH_LISTBOX_ID = 'global-search-listbox';

// Stable id for one option row, by its flat index across all sections.
export function searchOptionId(flatIndex: number): string {
  return `global-search-opt-${flatIndex}`;
}

// The id the input's aria-activedescendant should point at: the active option
// when the dropdown is open and the index is in range, otherwise undefined
// (dropdown collapsed, empty, or nothing highlighted).
export function searchActiveDescendantId(
  activeIndex: number,
  rowCount: number,
  open: boolean,
): string | undefined {
  if (!open || rowCount <= 0) return undefined;
  if (activeIndex < 0 || activeIndex >= rowCount) return undefined;
  return searchOptionId(activeIndex);
}

// Next highlighted row for an arrow key, clamped to [0, rowCount-1]. Any other
// key leaves the selection where it is. Mirrors the prior inline handler.
export function nextActiveIndex(current: number, key: string, rowCount: number): number {
  if (key === 'ArrowDown') return Math.min(current + 1, Math.max(rowCount - 1, 0));
  if (key === 'ArrowUp') return Math.max(current - 1, 0);
  return current;
}
