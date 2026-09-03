import { describe, expect, it } from 'vitest';
import { deriveRowLayout } from './row-layout';

describe('deriveRowLayout', () => {
  it('selects the template and cell flags from chip placement and slot presence', () => {
    const chipColumn = deriveRowLayout({ chips: 'x', inlineChips: false });
    const noChips = deriveRowLayout({ inlineChips: false });
    const inline = deriveRowLayout({ chips: 'x', inlineChips: true });
    expect(chipColumn.showChipColumn).toBe(true);
    expect(noChips.showChipColumn).toBe(false);
    expect(inline.showChipColumn).toBe(false);
    expect(inline.showInlineChips).toBe(true);
    expect(chipColumn.colsClass).toBe('grid-cols-[26px_minmax(0,1fr)_auto_auto]');
    expect(noChips.colsClass).toBe('grid-cols-[26px_minmax(0,1fr)_auto]');
    expect(inline.colsClass).toBe(noChips.colsClass);

    expect(deriveRowLayout({ inlineChips: true }).showInlineChips).toBe(false);

    const overridden = deriveRowLayout({
      chips: 'x',
      inlineChips: false,
      colsClass: 'grid-cols-[1fr_auto]',
    });
    expect(overridden.colsClass).toBe('grid-cols-[1fr_auto]');
    expect(overridden.showChipColumn).toBe(true);

    expect(deriveRowLayout({ leading: 'L', inlineChips: false }).showLeading).toBe(true);
    expect(deriveRowLayout({ inlineChips: false }).showLeading).toBe(false);
    expect(deriveRowLayout({ trailing: 'T', inlineChips: false }).showTrailing).toBe(true);
    expect(deriveRowLayout({ inlineChips: false }).showTrailing).toBe(false);
  });
});
