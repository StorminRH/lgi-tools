import { describe, expect, it } from 'vitest';
import { itemImage, nodeImage } from '@/data/eve-data/type-images';
import { nodeCardView } from './node-card-view';

const base = { typeId: 34, selected: false, related: false, faded: false };

describe('nodeCardView', () => {
  it('is non-interactive with no onSelect', () => {
    const view = nodeCardView(base);
    expect(view.interactive).toBe(false);
  });

  it('is interactive when onSelect is set', () => {
    const view = nodeCardView({ ...base, selected: true, onSelect: () => {} });
    expect(view.interactive).toBe(true);
  });

  it('defaults the icon to the item itself, or forwards a provided rendition', () => {
    expect(nodeCardView(base).iconDesc).toEqual(itemImage(34));
    expect(nodeCardView({ ...base, icon: nodeImage(999, 34) }).iconDesc).toEqual(
      nodeImage(999, 34),
    );
  });

  it('reflects the visual state in the class list', () => {
    expect(nodeCardView({ ...base, faded: true }).className).toContain('opacity-25');
    expect(nodeCardView({ ...base, related: true }).className).toContain('bg-row-related');
    expect(nodeCardView({ ...base, selected: true }).className).toContain('bg-isk-selected');
    expect(nodeCardView({ ...base, onSelect: () => {} }).className).toContain('cursor-pointer');
    // A plain card carries none of the state modifiers.
    const plain = nodeCardView(base).className;
    expect(plain).not.toContain('opacity-25');
    expect(plain).not.toContain('cursor-pointer');
  });
});
