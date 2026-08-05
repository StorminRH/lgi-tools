import { describe, expect, it } from 'vitest';
import { itemImage, nodeImage } from '@/data/eve-data/type-images';
import { nodeCardView } from './node-card-view';

const base = { typeId: 34, selected: false, related: false, faded: false };

describe('nodeCardView', () => {
  it('is interactive only when onSelect is set', () => {
    expect(nodeCardView(base).interactive).toBe(false);
    expect(nodeCardView({ ...base, selected: true, onSelect: () => {} }).interactive).toBe(true);
  });

  it('defaults the icon to the item itself, or forwards a provided rendition', () => {
    expect(nodeCardView(base).iconDesc).toEqual(itemImage(34));
    expect(nodeCardView({ ...base, icon: nodeImage(999, 34) }).iconDesc).toEqual(
      nodeImage(999, 34),
    );
  });
});
