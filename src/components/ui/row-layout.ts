import type { ReactNode } from 'react';

/** Resolved column template plus which optional cells an EntityRow renders. */
export type RowLayout = {
  colsClass: string;
  showLeading: boolean;
  showInlineChips: boolean;
  showTrailing: boolean;
  showChipColumn: boolean;
};

/**
 * deriveRowLayout — the pure layout decision behind EntityRow: pick the grid
 * template (a caller `colsClass` wins, else the default gains a dedicated chip
 * column only when chips sit in their own trailing column) and report which
 * optional cells are present. Kept separate so the render shell stays
 * branch-free and this logic is unit-tested.
 */
export function deriveRowLayout({
  leading,
  chips,
  trailing,
  colsClass,
  inlineChips,
}: {
  leading?: ReactNode;
  chips?: ReactNode;
  trailing?: ReactNode;
  colsClass?: string;
  inlineChips: boolean;
}): RowLayout {
  const hasChips = chips !== undefined;
  const showChipColumn = hasChips && !inlineChips;
  const defaultColsClass = showChipColumn
    ? 'grid-cols-[26px_minmax(0,1fr)_auto_auto]'
    : 'grid-cols-[26px_minmax(0,1fr)_auto]';
  return {
    colsClass: colsClass ?? defaultColsClass,
    showLeading: leading !== undefined,
    showInlineChips: inlineChips && hasChips,
    showTrailing: trailing !== undefined,
    showChipColumn,
  };
}
