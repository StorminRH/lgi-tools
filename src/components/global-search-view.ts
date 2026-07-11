import type { SearchResult, SearchSection } from '@/search';
import { SEARCH_LISTBOX_ID, searchActiveDescendantId } from '@/components/global-search-aria';

// Splits a label into matched / unmatched runs for highlight rendering. Adjacent
// matched chars collapse into one run so a substring match renders as a single
// highlighted span, not N nested ones. With no indices the whole label is one
// unmatched run.
export function splitMatchRuns(
  label: string,
  indices?: number[],
): { matched: boolean; text: string }[] {
  if (!indices || indices.length === 0) return [{ matched: false, text: label }];
  const hit = new Set(indices);
  const runs: { matched: boolean; text: string }[] = [];
  let i = 0;
  while (i < label.length) {
    const matched = hit.has(i);
    let j = i;
    while (j < label.length && hit.has(j) === matched) j++;
    runs.push({ matched, text: label.slice(i, j) });
    i = j;
  }
  return runs;
}

export function isArrowKey(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp';
}

// The flat-row index the first result of section `sIdx` occupies — so per-row
// activeIndex math lines up with keyboard navigation across the whole list.
export function sectionOffset(sections: SearchSection[], sIdx: number): number {
  return sections.slice(0, sIdx).reduce((sum, s) => sum + s.results.length, 0);
}

// The input's derived read: whether the dropdown is open, the wrapper class, and
// the aria wiring (all keyed off `active` + whether there are any sections).
export function deriveGlobalSearchView(input: {
  active: boolean;
  sectionCount: number;
  activeIndex: number;
  flatRowCount: number;
}) {
  const showDropdown = input.active && input.sectionCount > 0;
  return {
    showDropdown,
    wrapperClass: `nav-search ${input.active ? 'active' : ''}`,
    ariaControls: showDropdown ? SEARCH_LISTBOX_ID : undefined,
    ariaActivedescendant: searchActiveDescendantId(input.activeIndex, input.flatRowCount, showDropdown),
  };
}

// A result row's derived class + icon strings.
export function deriveSearchRowView(row: SearchResult, isActiveRow: boolean) {
  return {
    rowClass: `dd-row ${isActiveRow ? 'active' : ''} ${row.disabled ? 'disabled' : ''}`,
    iconMono: row.iconText ?? row.label.slice(0, 2),
    iconClass: `dd-icon ${row.iconTone ?? ''}`,
  };
}
