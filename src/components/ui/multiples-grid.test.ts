import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MultiplesCell, MultiplesGrid } from './multiples-grid';

function grid(...cells: ReactElement[]): string {
  return renderToStaticMarkup(MultiplesGrid({ columns: 2, children: cells }));
}

describe('MultiplesGrid', () => {
  it('marks the tiles up as a description list of title and figures', () => {
    const html = grid(createElement(MultiplesCell, { key: 'a', title: 'User accounts', value: '1', note: 'since launch' }));
    expect(html).toMatch(/^<dl class="grid grid-cols-1 md:grid-cols-2 gap-px bg-border-soft"><div class="[^"]*">/);
    expect(html).toMatch(/<dt class="[^"]*">User accounts<\/dt><dd class="flex items-baseline gap-2">/);
    expect(html).toContain('<dd class="font-data text-micro text-muted">since launch</dd>');
  });

  it('insets each tile like card headers and rows', () => {
    const html = grid(createElement(MultiplesCell, { key: 'a', title: 'a', value: '1' }));
    expect(html).toContain('<div class="bg-bg px-3.5 py-3 flex flex-col gap-1.5">');
  });

  it('draws the chart slot only when there is something in it', () => {
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

  it('takes a composed value and a delta beside it', () => {
    const html = grid(
      createElement(MultiplesCell, {
        key: 'm',
        title: 'Margin',
        value: createElement('span', null, '+41.2', createElement('small', null, 'M')),
        delta: createElement('em', null, '+6%'),
      }),
    );
    expect(html).toContain('<span>+41.2<small>M</small></span></span><em>+6%</em></dd>');
  });
});
