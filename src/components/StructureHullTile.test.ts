import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StructureHullTile } from './StructureHullTile';

describe('StructureHullTile', () => {
  it('shows a known hull as its CCP type icon', () => {
    const html = renderToStaticMarkup(createElement(StructureHullTile, { typeId: 35825, hullName: 'Raitaru' }));
    expect(html).toContain('https://images.evetech.net/types/35825/icon');
    expect(html).not.toContain('>Ra<');
  });

  it('shows a blank tile until the hull is known', () => {
    const html = renderToStaticMarkup(createElement(StructureHullTile, { typeId: null, hullName: null }));
    expect(html).not.toContain('images.evetech.net');
    expect(html).toContain('>?</span>');
  });
});
