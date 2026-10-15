import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { MultiplesCell, MultiplesGrid } from './multiples-grid';

function grid(...cells: ReactElement[]): string {
  return renderToStaticMarkup(MultiplesGrid({ columns: 2, children: cells }));
}

test('marks the tiles up as a description list of title, composed value with its delta, and note', () => {
  const html = grid(
    createElement(MultiplesCell, {
      key: 'm',
      title: 'Margin',
      value: createElement('span', null, '+41.2', createElement('small', null, 'M')),
      delta: createElement('em', null, '+6%'),
      note: 'since launch',
    }),
  );
  expect(html).toMatch(/^<dl [^>]*><div [^>]*><dt [^>]*>Margin<\/dt><dd [^>]*>/);
  expect(html).toContain('<span>+41.2<small>M</small></span></span><em>+6%</em></dd>');
  expect(html).toMatch(/<dd [^>]*>since launch<\/dd>/);
});

test('draws the chart slot only when there is something in it', () => {
  const bare = grid(
    createElement(MultiplesCell, { key: 'a', title: 'a', value: '1' }),
    createElement(MultiplesCell, { key: 'b', title: 'b', value: '2' }, null),
  );
  expect(bare).not.toContain('mt-1');
  expect(bare.match(/<dd/g)).toHaveLength(2);
  const charted = grid(
    createElement(MultiplesCell, { key: 'c', title: 'c', value: '3' }, createElement('svg', { role: 'img', 'aria-label': 'trend' })),
  );
  expect(charted).toContain('<dd class="mt-1"><svg role="img" aria-label="trend"></svg></dd>');
});
