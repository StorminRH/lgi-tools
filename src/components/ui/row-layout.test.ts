import { describe, expect, it } from 'vitest';
import { deriveRowLayout } from './row-layout';

describe('deriveRowLayout', () => {
  it('adds a dedicated chip column to the default template when chips render in their own column', () => {
    const layout = deriveRowLayout({ chips: 'x', inlineChips: false });
    expect(layout.colsClass).toBe('grid-cols-[26px_minmax(0,1fr)_auto_auto]');
    expect(layout.showChipColumn).toBe(true);
  });

  it('uses the three-column default template when there are no chips', () => {
    const layout = deriveRowLayout({ inlineChips: false });
    expect(layout.colsClass).toBe('grid-cols-[26px_minmax(0,1fr)_auto]');
    expect(layout.showChipColumn).toBe(false);
  });

  it('keeps the three-column template and drops the chip column when chips render inline', () => {
    const layout = deriveRowLayout({ chips: 'x', inlineChips: true });
    expect(layout.colsClass).toBe('grid-cols-[26px_minmax(0,1fr)_auto]');
    expect(layout.showChipColumn).toBe(false);
    expect(layout.showInlineChips).toBe(true);
  });

  it('does not render chips inline when the inline flag is set but no chips are supplied', () => {
    const layout = deriveRowLayout({ inlineChips: true });
    expect(layout.showInlineChips).toBe(false);
    expect(layout.showChipColumn).toBe(false);
  });

  it('lets a caller-supplied colsClass override the default template', () => {
    const layout = deriveRowLayout({
      chips: 'x',
      inlineChips: false,
      colsClass: 'grid-cols-[1fr_auto]',
    });
    expect(layout.colsClass).toBe('grid-cols-[1fr_auto]');
    // showChipColumn still reflects chip presence even when the template is overridden.
    expect(layout.showChipColumn).toBe(true);
  });

  it('reports the leading cell only when a leading node is present', () => {
    expect(deriveRowLayout({ leading: 'L', inlineChips: false }).showLeading).toBe(true);
    expect(deriveRowLayout({ inlineChips: false }).showLeading).toBe(false);
  });

  it('reports the trailing cell only when a trailing node is present', () => {
    expect(deriveRowLayout({ trailing: 'T', inlineChips: false }).showTrailing).toBe(true);
    expect(deriveRowLayout({ inlineChips: false }).showTrailing).toBe(false);
  });
});
