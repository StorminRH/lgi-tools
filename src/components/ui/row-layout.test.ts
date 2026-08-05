import { describe, expect, it } from 'vitest';
import { deriveRowLayout } from './row-layout';

describe('deriveRowLayout', () => {
  it('selects the template and cell flags from chip placement and slot presence', () => {
    // Column chips widen the template; inline or absent chips keep the default.
    const chipColumn = deriveRowLayout({ chips: 'x', inlineChips: false });
    const noChips = deriveRowLayout({ inlineChips: false });
    const inline = deriveRowLayout({ chips: 'x', inlineChips: true });
    expect(chipColumn.showChipColumn).toBe(true);
    expect(noChips.showChipColumn).toBe(false);
    expect(inline.showChipColumn).toBe(false);
    expect(inline.showInlineChips).toBe(true);
    expect(chipColumn.colsClass).not.toBe(noChips.colsClass);
    expect(inline.colsClass).toBe(noChips.colsClass);

    // The inline flag without chips renders nothing.
    expect(deriveRowLayout({ inlineChips: true }).showInlineChips).toBe(false);

    // A caller template wins while chip presence still reports.
    const overridden = deriveRowLayout({
      chips: 'x',
      inlineChips: false,
      colsClass: 'grid-cols-[1fr_auto]',
    });
    expect(overridden.colsClass).toBe('grid-cols-[1fr_auto]');
    expect(overridden.showChipColumn).toBe(true);

    // Leading/trailing cells only when their nodes are present.
    expect(deriveRowLayout({ leading: 'L', inlineChips: false }).showLeading).toBe(true);
    expect(deriveRowLayout({ inlineChips: false }).showLeading).toBe(false);
    expect(deriveRowLayout({ trailing: 'T', inlineChips: false }).showTrailing).toBe(true);
    expect(deriveRowLayout({ inlineChips: false }).showTrailing).toBe(false);
  });
});
