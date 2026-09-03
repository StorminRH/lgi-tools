import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test } from 'vitest';
import {
  SiteCatalogueProvider,
  useSiteCatalogue,
} from './site-catalogue';
import { setSiteNameIndex, siteIdForSiteName } from './site-name-lookup';

afterEach(() => {
  setSiteNameIndex([]);
});

function Probe({ name }: { readonly name: string }) {
  const catalogue = useSiteCatalogue();
  return createElement('span', {
    'data-site-id': String(catalogue.siteIdForName(name) ?? 'null'),
    'data-est-isk': String(catalogue.estIskForName(name) ?? 'null'),
  });
}

test('SiteCatalogueProvider resolves from props on first render and falls back to the module index', () => {

  expect(siteIdForSiteName('Barren Perimeter Reservoir')).toBeNull();

  const fromProps = renderToStaticMarkup(
    createElement(
      SiteCatalogueProvider,
      {
        siteIndex: [
          {
            id: 49,
            name: 'Barren Perimeter Reservoir',
            siteType: 'gas',
            wormholeClass: null,
            blueLootIsk: null,
            resourceValueIsk: 82_432_500,
            liveRecipes: [{ typeId: 30370, units: 2_500, seedIsk: 28_100_000 }],
          },
        ],
      },
      createElement(Probe, { name: 'Barren Perimeter Reservoir' }),
    ),
  );
  expect(fromProps).toContain('data-site-id="49"');
  expect(fromProps).toContain('data-est-isk="82432500"');

  const oreAlias = renderToStaticMarkup(
    createElement(
      SiteCatalogueProvider,
      {
        siteIndex: [
          {
            id: 63,
            name: 'Ordinary Permiter Deposit',
            siteType: 'ore',
            wormholeClass: null,
            blueLootIsk: null,
            resourceValueIsk: 2_000_000,
          },
        ],
      },
      createElement(Probe, { name: 'Ordinary Perimeter Deposit' }),
    ),
  );
  expect(oreAlias).toContain('data-site-id="63"');
  expect(oreAlias).toContain('data-est-isk="2000000"');

  setSiteNameIndex([
    {
      id: 49,
      name: 'Barren Perimeter Reservoir',
      estIsk: 1,
      liveRecipes: [],
    },
  ]);
  const fromModule = renderToStaticMarkup(
    createElement(Probe, { name: 'Barren Perimeter Reservoir' }),
  );
  expect(fromModule).toContain('data-site-id="49"');
});
