import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import AtlasLoading from './loading';
import AtlasPage from './page';

it('keeps Atlas streaming through the same PageHead shell for page and loading', () => {
  for (const markup of [
    renderToStaticMarkup(
      createElement(AtlasPage, { searchParams: Promise.resolve({}) }),
    ),
    renderToStaticMarkup(createElement(AtlasLoading)),
  ]) {
    expect(markup).toContain('data-page-shell');
    expect(markup).toContain('lgi://</span>atlas');
    expect(markup).toContain('>Atlas</h1>');
    expect(markup).not.toContain('Mapping the unknown');
  }

  expect(
    renderToStaticMarkup(
      createElement(AtlasPage, { searchParams: Promise.resolve({}) }),
    ),
  ).not.toContain('data-map-canvas');
});
