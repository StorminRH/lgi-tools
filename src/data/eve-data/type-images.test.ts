import { describe, expect, it } from 'vitest';
import {
  blueprintImage,
  heroImage,
  isRenderableCategory,
  itemImage,
  jobImage,
  nodeImage,
} from './type-images';

describe('itemImage', () => {
  it('shows the item itself in the inventory icon rendition', () => {
    expect(itemImage(34)).toEqual({ typeId: 34, variant: 'icon' });
  });
});

describe('blueprintImage', () => {
  it('shows a blueprint row in the blueprint-scroll rendition', () => {
    expect(blueprintImage(691)).toEqual({ typeId: 691, variant: 'bp' });
  });
});

describe('heroImage', () => {
  it('uses a 3D render only for a product known to be renderable', () => {
    expect(heroImage(587, true)).toEqual({ typeId: 587, variant: 'render' });
  });

  it('degrades a non-renderable product to its inventory icon', () => {
    expect(heroImage(34, false)).toEqual({ typeId: 34, variant: 'icon' });
  });
});

describe('nodeImage', () => {
  it('renders a buildable/reaction node as the producing type in the `bp` rendition', () => {
    // Both a manufacturing blueprint and a reaction formula serve `bp` (a
    // blueprint type has no `icon` rendition), so the producing typeId + `bp`
    // covers both node kinds.
    expect(nodeImage(1186, 1185)).toEqual({ typeId: 1186, variant: 'bp' });
    expect(nodeImage(46175, 16666)).toEqual({ typeId: 46175, variant: 'bp' });
  });

  it('keeps a raw/leaf node on the item icon when there is no producing type', () => {
    expect(nodeImage(undefined, 34)).toEqual({ typeId: 34, variant: 'icon' });
  });
});

describe('jobImage', () => {
  it('shows the product icon when ESI reported a product', () => {
    expect(jobImage(587, 691)).toEqual({ typeId: 587, variant: 'icon' });
  });

  it('shows the blueprint rendition when ESI omitted the product', () => {
    expect(jobImage(undefined, 691)).toEqual({ typeId: 691, variant: 'bp' });
  });
});

describe('isRenderableCategory', () => {
  it('is true for the categories that serve a 3D render', () => {
    expect(isRenderableCategory('Ship')).toBe(true);
    expect(isRenderableCategory('Drone')).toBe(true);
    expect(isRenderableCategory('Structure')).toBe(true);
  });

  it('is false for categories that only serve an icon (would 400 on /render)', () => {
    expect(isRenderableCategory('Module')).toBe(false);
    expect(isRenderableCategory('Charge')).toBe(false);
    expect(isRenderableCategory('Material')).toBe(false);
    expect(isRenderableCategory('')).toBe(false);
  });
});
