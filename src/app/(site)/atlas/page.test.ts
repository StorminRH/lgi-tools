import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AtlasLoading from './loading';
import AtlasPage, { instant } from './page';

describe('Atlas route entry', () => {
  it('opts the intentionally wall-replaceable leaf out of instant validation', () => {
    expect(instant).toBe(false);
  });

  it('paints the site PageHead shell while the administrator gate resolves', () => {
    const markup = renderToStaticMarkup(
      createElement(AtlasPage, { searchParams: Promise.resolve({}) }),
    );
    expect(markup).toContain('data-page-shell');
    expect(markup).toContain('lgi://</span>atlas');
    expect(markup).toContain('>Atlas</h1>');
    expect(markup).not.toContain('Mapping the unknown');
    expect(markup).not.toContain('data-map-canvas');
  });

  it('uses the same PageHead shell for the route loading state', () => {
    const markup = renderToStaticMarkup(createElement(AtlasLoading));
    expect(markup).toContain('data-page-shell');
    expect(markup).toContain('lgi://</span>atlas');
    expect(markup).toContain('>Atlas</h1>');
    expect(markup).not.toContain('Mapping the unknown');
  });
});
