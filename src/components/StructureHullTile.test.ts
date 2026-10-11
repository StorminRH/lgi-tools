import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { PlaceholderTile, StructureHullTile } from './StructureHullTile';

test('a known hull shows its CCP type icon, an unknown hull a blank tile, and a placeholder label is hidden from assistive tech', () => {
  const known = renderToStaticMarkup(createElement(StructureHullTile, { typeId: 35825, hullName: 'Raitaru' }));
  expect(known).toContain('https://images.evetech.net/types/35825/icon');
  expect(known).not.toContain('>?</span>');

  const blank = renderToStaticMarkup(createElement(StructureHullTile, { typeId: null, hullName: null }));
  expect(blank).not.toContain('images.evetech.net');
  expect(blank).toContain('>?</span>');

  const station = renderToStaticMarkup(createElement(PlaceholderTile, { label: 'NPC' }));
  expect(station).toMatch(/^<span aria-hidden="true" [^>]*>NPC<\/span>$/);
});
