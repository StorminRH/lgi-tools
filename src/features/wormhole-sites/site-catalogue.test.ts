import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
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

describe('SiteCatalogueProvider', () => {
  it('resolves catalogue-matched names on the first render from props', () => {
    // Module index stays empty — the provider must not depend on a later effect.
    expect(siteIdForSiteName('Barren Perimeter Reservoir')).toBeNull();

    const markup = renderToStaticMarkup(
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

    expect(markup).toContain('data-site-id="49"');
    expect(markup).toContain('data-est-isk="82432500"');
  });

  it('falls back to the module index outside a provider', () => {
    setSiteNameIndex([
      {
        id: 49,
        name: 'Barren Perimeter Reservoir',
        estIsk: 1,
        liveRecipes: [],
      },
    ]);
    const markup = renderToStaticMarkup(
      createElement(Probe, { name: 'Barren Perimeter Reservoir' }),
    );
    expect(markup).toContain('data-site-id="49"');
  });
});
