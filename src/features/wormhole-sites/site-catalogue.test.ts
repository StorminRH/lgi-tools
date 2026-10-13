import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { siteSearchEntry } from './__tests__/site-fixtures';
import { setSiteSearchIndex, sitesSearchSource } from './search';
import {
  SiteCatalogueProvider,
  useSiteCatalogue,
} from './site-catalogue';

// There is no DOM here, so effects never run under renderToStaticMarkup.
// Running them during the render lets a test see anything an effect writes.
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  const runNow = (effect: () => void) => {
    effect();
  };
  return { ...react, useEffect: runNow, useLayoutEffect: runNow };
});

function Probe({ name }: { readonly name: string }) {
  const catalogue = useSiteCatalogue();
  return createElement('span', {
    'data-site-id': String(catalogue.siteIdForName(name) ?? 'null'),
    'data-est-isk': String(catalogue.estIskForName(name) ?? 'null'),
    'data-live-recipes': String(catalogue.liveRecipesForName(name).length),
  });
}

test('SiteCatalogueProvider resolves from props on first render, and nothing resolves outside one', () => {
  const fromProps = renderToStaticMarkup(
    createElement(
      SiteCatalogueProvider,
      {
        siteIndex: [
          siteSearchEntry({
            id: 49,
            name: 'Barren Perimeter Reservoir',
            siteType: 'gas',
            wormholeClass: null,
            resourceValueIsk: 82_432_500,
            liveRecipes: [{ typeId: 30370, units: 2_500, seedIsk: 28_100_000 }],
          }),
        ],
      },
      createElement(Probe, { name: 'Barren Perimeter Reservoir' }),
    ),
  );
  expect(fromProps).toContain('data-site-id="49"');
  expect(fromProps).toContain('data-est-isk="82432500"');
  expect(fromProps).toContain('data-live-recipes="1"');

  const oreAlias = renderToStaticMarkup(
    createElement(
      SiteCatalogueProvider,
      {
        siteIndex: [
          siteSearchEntry({
            id: 63,
            name: 'Ordinary Permiter Deposit',
            siteType: 'ore',
            wormholeClass: null,
            resourceValueIsk: 2_000_000,
          }),
        ],
      },
      createElement(Probe, { name: 'Ordinary Perimeter Deposit' }),
    ),
  );
  expect(oreAlias).toContain('data-site-id="63"');
  expect(oreAlias).toContain('data-est-isk="2000000"');
  expect(oreAlias).toContain('data-live-recipes="0"');

  const outside = renderToStaticMarkup(
    createElement(Probe, { name: 'Barren Perimeter Reservoir' }),
  );
  expect(outside).toContain('data-site-id="null"');
  expect(outside).toContain('data-est-isk="null"');
  expect(outside).toContain('data-live-recipes="0"');
});

test('SiteCatalogueProvider leaves the search index to GlobalSearch', async () => {
  const sheet = siteSearchEntry({
    id: 49,
    name: 'Barren Perimeter Reservoir',
    siteType: 'gas',
    wormholeClass: null,
    resourceValueIsk: 42_000_000,
  });
  setSiteSearchIndex([sheet]);

  const live = { ...sheet, resourceValueIsk: 99_000_000 };
  const html = renderToStaticMarkup(
    createElement(
      SiteCatalogueProvider,
      { siteIndex: [live] },
      createElement(Probe, { name: 'Barren Perimeter Reservoir' }),
    ),
  );
  expect(html).toContain('data-est-isk="99000000"');

  const [hit] = await sitesSearchSource.search('Barren Perimeter Reservoir', {
    session: null,
    isAdmin: false,
    recents: [],
  });
  expect(hit?.sub).toBe('Gas · 42M');
});
