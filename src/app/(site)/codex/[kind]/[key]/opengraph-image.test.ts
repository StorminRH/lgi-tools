import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPricedSiteDetail: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: () => mocks.notFound() }));
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(readonly element: ReactElement) {}
  },
}));
vi.mock('@/features/wormhole-sites/queries', () => ({ getPricedSiteDetail: mocks.getPricedSiteDetail }));

import Image from './opengraph-image';

const SITE = {
  id: 20,
  name: 'Outpost Frontier Stronghold',
  siteType: 'combat',
  wormholeClass: 'C3',
  blueLootIsk: 45_100_000,
  resourceValueIsk: null,
  waves: [],
  resources: [],
};

const params = (kind: string, key: string) => Promise.resolve({ kind, key });

test('a published site renders its share card', async () => {
  mocks.getPricedSiteDetail.mockReset().mockResolvedValue(SITE);
  const image = (await Image({ params: params('sites', '20') })) as unknown as { element: ReactElement };

  expect(renderToStaticMarkup(image.element)).toContain('Outpost Frontier Stronghold');
});

test('an unpublished site 404s before it reads the site', async () => {
  mocks.getPricedSiteDetail.mockReset();
  await expect(Image({ params: params('sites', '70') })).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.getPricedSiteDetail).not.toHaveBeenCalled();
});

test.each([
  ['guides', '20'],
  ['nope', '20'],
  ['sites', '007'],
])('%s/%s has no share card', async (kind, key) => {
  mocks.getPricedSiteDetail.mockReset().mockResolvedValue(SITE);
  await expect(Image({ params: params(kind, key) })).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.getPricedSiteDetail).not.toHaveBeenCalled();
});
