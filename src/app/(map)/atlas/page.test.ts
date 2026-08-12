import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/mapper', () => ({
  MapCanvas: () => createElement('div', { 'data-map-canvas': '' }),
}));

vi.mock('@/features/maps/MapCatalogue', () => ({
  MapCatalogue: () => createElement('div', { 'data-map-catalogue': '' }),
}));

import { AtlasEntry } from './AtlasEntry';
import AtlasPage, { instant } from './page';

beforeEach(() => {
  mocks.searchParams = new URLSearchParams();
});

describe('Atlas route entry', () => {
  it('opts the intentionally wall-replaceable leaf out of instant validation', () => {
    expect(instant).toBe(false);
  });

  it('renders the catalogue with no map and the unchanged canvas for any present map value', () => {
    const landing = renderToStaticMarkup(createElement(AtlasEntry));
    expect(landing).toContain('data-map-catalogue');
    expect(landing).not.toContain('data-map-canvas');

    mocks.searchParams = new URLSearchParams('map=map-a');
    const selected = renderToStaticMarkup(createElement(AtlasEntry));
    expect(selected).toContain('data-map-canvas');
    expect(selected).not.toContain('data-map-catalogue');

    mocks.searchParams = new URLSearchParams('map=');
    const emptyValue = renderToStaticMarkup(createElement(AtlasEntry));
    expect(emptyValue).toContain('data-map-canvas');
    expect(emptyValue).not.toContain('data-map-catalogue');
  });

  it('keeps the server page as the metadata-owning wrapper around the client entry', () => {
    expect(renderToStaticMarkup(createElement(AtlasPage))).toContain('data-map-catalogue');
  });
});
