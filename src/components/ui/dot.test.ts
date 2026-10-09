import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dot } from './dot';

describe('Dot', () => {
  it('is decorative on its own', () => {
    const html = renderToStaticMarkup(createElement(Dot, { tone: 'green' }));
    expect(html).toMatch(/^<span aria-hidden="true" class="[^"]*bg-isk[^"]*"><\/span>$/);
  });

  it('reads its label as screen-reader text beside the hidden dot', () => {
    const html = renderToStaticMarkup(createElement(Dot, { tone: 'red', size: 'lg', label: 'Failing' }));
    expect(html).toMatch(/^<span aria-hidden="true" class="[^"]*size-2[^"]*"><\/span><span class="sr-only">Failing<\/span>$/);
  });
});
