import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SiteDetailPage, { SiteDetailContent } from './page';

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

const site = {
  id: 1,
  name: 'Forgotten Perimeter Coronation Platform',
  siteType: 'relic' as const,
  wormholeClass: 'C1' as const,
  signatureLabel: 'ABC-123',
  sourceTab: 'Sheet',
  blueLootIsk: 1,
  iskPerEhp: null,
  resourceValueIsk: null,
  waves: [],
  resources: [],
};

describe('SiteDetailPage', () => {
  beforeEach(() => {
    mocks.getPricedSiteDetail.mockReset();
    mocks.getSiteSearchIndex.mockReset();
    mocks.selectRelatedSites.mockReset();
    mocks.notFound.mockClear();
    mocks.getPricedSiteDetail.mockResolvedValue(site);
    mocks.getSiteSearchIndex.mockResolvedValue([site]);
    mocks.selectRelatedSites.mockReturnValue([]);
  });

  it('keeps params under Suspense for Instant navigations', () => {
    const tree = SiteDetailPage({
      params: Promise.resolve({ id: '1' }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(tree);
    // Sync shell only — params-bound content streams inside Suspense.
    expect(html).toContain('Loading site');
    expect(html).toContain('max-w-[32rem]');
    expect(mocks.getPricedSiteDetail).not.toHaveBeenCalled();
  });

  it('hosts the standalone card inside the G-1 detail measure', async () => {
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
});
