import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import { siteDetail } from '@/features/wormhole-sites/__tests__/site-fixtures';
import SiteDetailPage, { generateMetadata, SiteDetailContent } from './page';

const mocks = vi.hoisted(() => ({
  getPricedSiteDetail: vi.fn(),
  getSiteSearchIndex: vi.fn(),
  selectRelatedSites: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mocks.notFound(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: unknown;
  }) => createElement('a', { href, ...rest }, children as never),
}));

vi.mock('@/features/wormhole-sites/queries', () => ({
  getPricedSiteDetail: (id: number) => mocks.getPricedSiteDetail(id),
  getSiteSearchIndex: () => mocks.getSiteSearchIndex(),
}));

vi.mock('@/features/wormhole-sites/related-sites', () => ({
  selectRelatedSites: (...args: unknown[]) => mocks.selectRelatedSites(...args),
}));

vi.mock('@/features/wormhole-sites/components/SiteCard', () => ({
  SiteCard: ({
    presentation,
    site,
  }: {
    presentation?: string;
    site: { name: string };
  }) =>
    createElement(
      'div',
      {
        'data-site-card': '',
        'data-presentation': presentation ?? 'catalogue',
      },
      site.name,
    ),
}));

vi.mock('@/features/wormhole-sites/components/RelatedSites', () => ({
  RelatedSites: () => createElement('div', { 'data-related-sites': '' }),
}));

vi.mock('@/features/wormhole-sites/components/SiteMetaStrip', () => ({
  SiteMetaStrip: () => createElement('div', { 'data-site-meta-strip': '' }),
}));

vi.mock('@/components/composition/JsonLd', () => ({
  JsonLd: () => null,
}));

vi.mock('@/data/market-prices/cache', () => ({
  getCachedPricesFreshness: async () => ({ lastUpdatedAt: null }),
}));

const site = siteDetail({
  id: 1,
  name: 'Forgotten Perimeter Coronation Platform',
  siteType: 'relic',
  wormholeClass: 'C1',
  blueLootIsk: 1,
});

beforeEach(() => {
  mocks.getPricedSiteDetail.mockReset();
  mocks.getSiteSearchIndex.mockReset();
  mocks.selectRelatedSites.mockReset();
  mocks.notFound.mockClear();
  mocks.getPricedSiteDetail.mockResolvedValue(site);
  mocks.getSiteSearchIndex.mockResolvedValue([site]);
  mocks.selectRelatedSites.mockReturnValue([]);
});

test('site detail keeps params under Suspense then hosts the standalone card', async () => {
  const shell = SiteDetailPage({
    params: Promise.resolve({ id: '1' }),
    searchParams: Promise.resolve({}),
  });
  const shellHtml = renderToStaticMarkup(shell);
  expect(shellHtml).toContain('Loading site');
  expect(shellHtml).toContain('max-w-[32rem]');
  expect(mocks.getPricedSiteDetail).not.toHaveBeenCalled();

  const tree = await SiteDetailContent({
    params: Promise.resolve({ id: '1' }),
    searchParams: Promise.resolve({}),
  });
  const html = renderToStaticMarkup(tree);

  expect(html).toContain('max-w-[32rem]');
  expect(html).not.toContain('max-w-reading');
  expect(html).toContain('data-presentation="standalone"');
  expect(html).toContain('Forgotten Perimeter Coronation Platform');
  expect(html).toContain('data-related-sites');
  expect(mocks.getPricedSiteDetail).toHaveBeenCalledWith(1);
});

test('site detail metadata leaves the share image to the per-site card and 404s a miss', async () => {
  const metadata = await generateMetadata({ params: Promise.resolve({ id: '1' }) });
  expect(metadata.title).toBe('Forgotten Perimeter Coronation Platform — C1 Relic');
  expect(metadata.alternates).toEqual({ canonical: '/sites/1' });
  expect(metadata.openGraph).toMatchObject({
    title: 'Forgotten Perimeter Coronation Platform — C1 Relic',
    url: '/sites/1',
  });
  // An own images key, even an undefined one, would mask opengraph-image.tsx.
  expect('images' in (metadata.openGraph ?? {})).toBe(false);
  expect('images' in (metadata.twitter ?? {})).toBe(false);

  mocks.getPricedSiteDetail.mockResolvedValue(null);
  await expect(generateMetadata({ params: Promise.resolve({ id: '2' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  await expect(
    SiteDetailContent({ params: Promise.resolve({ id: '2' }), searchParams: Promise.resolve({}) }),
  ).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.getPricedSiteDetail).toHaveBeenCalledTimes(3);

  await expect(
    SiteDetailContent({ params: Promise.resolve({ id: '01' }), searchParams: Promise.resolve({}) }),
  ).rejects.toThrow('NEXT_NOT_FOUND');
  expect(mocks.getPricedSiteDetail).toHaveBeenCalledTimes(3);
});
