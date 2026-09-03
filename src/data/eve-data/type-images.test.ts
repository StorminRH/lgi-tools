import { describe, expect, it } from 'vitest';
import { isRenderableCategory, jobImage, nodeImage } from './type-images';

describe('nodeImage', () => {
  it('renders a buildable/reaction node as the producing type in the `bp` rendition', () => {
    expect(nodeImage(1186, 1185)).toEqual({ typeId: 1186, variant: 'bp' });
    expect(nodeImage(46175, 16666)).toEqual({ typeId: 46175, variant: 'bp' });
  });

  it('keeps a raw/leaf node on the item icon when there is no producing type', () => {
    expect(nodeImage(undefined, 34)).toEqual({ typeId: 34, variant: 'icon' });
  });
});

describe('jobImage', () => {
  it('shows a manufacturing or reaction product as an inventory icon', () => {
    expect(jobImage(1, 587, 691)).toEqual({ typeId: 587, variant: 'icon' });
    expect(jobImage(9, 16666, 46175)).toEqual({ typeId: 16666, variant: 'icon' });
  });

  it('shows the blueprint rendition when ESI omitted the product', () => {
    expect(jobImage(1, undefined, 691)).toEqual({ typeId: 691, variant: 'bp' });
    expect(jobImage(3, undefined, 691)).toEqual({ typeId: 691, variant: 'bp' });
  });

  it('uses a blueprint rendition for science outputs even when ESI reports a product id', () => {
    expect(jobImage(3, 692, 692)).toEqual({ typeId: 692, variant: 'bp' });
    expect(jobImage(4, 32879, 32879)).toEqual({ typeId: 32879, variant: 'bp' });
    expect(jobImage(5, 4313, 4313)).toEqual({ typeId: 4313, variant: 'bp' });
    expect(jobImage(8, 11401, 11400)).toEqual({ typeId: 11401, variant: 'bp' });
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
