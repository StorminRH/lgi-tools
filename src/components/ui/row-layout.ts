import type { ReactNode } from 'react';

export type RowLayout = {
  colsClass: string;
  showLeading: boolean;
  showInlineChips: boolean;
  showTrailing: boolean;
  showChipColumn: boolean;
};

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
